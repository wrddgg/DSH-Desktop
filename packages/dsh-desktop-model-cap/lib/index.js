/**
 * User-declared model capabilities + vision bridge for DSH Desktop.
 *
 * Problem 1: every OpenAI-compatible adapter (DeepSeek included) declares
 * `inputModalities: ["text"]` for ANY model name, so a user-added multimodal
 * model (e.g. an opus-class model) is rejected for image attachments with
 * "当前模型不支持图片". This plugin registers a per-model capability table
 * (settings namespace `desktopModelCapabilities`) and wraps every provider
 * adapter so user-declared modalities win over the adapter defaults.
 *
 * Problem 2: for genuinely text-only models the desktop provides a vision
 * bridge: the `desktop_vision` tool reads a local image through the
 * user-configured vision API (OpenAI-compatible, settings namespace
 * `desktopVision`) and returns a text description, plus a system prompt
 * section telling the model to use it for referenced images.
 *
 * Zero official-code changes: settings namespaces, adapter wrapping, tool
 * registration, and prompt sections are all official extension points.
 */
import { readFile } from 'node:fs/promises'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

const CAPS_NS = settingsNamespace('desktop-model-capabilities')
const VISION_NS = settingsNamespace('desktop-vision')

const capsSchema = z.object({
  entries: z.array(z.object({
    provider: z.string(),
    model: z.string(),
    modalities: z.array(z.string()),
  })),
})

const visionSchema = z.object({
  baseURL: z.string(),
  apiKey: z.string(),
  model: z.string(),
  enabled: z.boolean(),
})

function wrapAdapter(adapter, readCaps) {
  const wrapper = Object.create(adapter)
  wrapper.listModels = async function listModels(provider) {
    const models = await adapter.listModels(provider)
    const caps = readCaps()
    return models.map((model) => {
      const cap = caps.find(entry => entry.provider === provider && entry.model === model.id)
      if (cap === undefined || cap.modalities.length === 0) return model
      return { ...model, inputModalities: [...cap.modalities] }
    })
  }
  wrapper.resolveModel = async function resolveModel(provider, model, signal) {
    const resolved = await adapter.resolveModel(provider, model, signal)
    const cap = readCaps().find(entry => entry.provider === provider && entry.model === model)
    if (cap === undefined || cap.modalities.length === 0) return resolved
    return { ...resolved, inputModalities: [...cap.modalities] }
  }
  return wrapper
}

const VISION_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
}

export const inject = ['tools', 'systemPrompt']

export function apply(ctx) {
  let capsScope
  let visionScope

  const readCaps = () => {
    try {
      return capsScope?.get().entries ?? []
    } catch {
      return []
    }
  }
  const readVision = () => {
    try {
      return visionScope?.get() ?? { baseURL: '', apiKey: '', model: '', enabled: false }
    } catch {
      return { baseURL: '', apiKey: '', model: '', enabled: false }
    }
  }

  // Settings registration rides the official settings seam (no-op when the
  // settings service is not composed).
  ctx.inject?.(['settings'], (sctx) => {
    capsScope = sctx.settings.register(CAPS_NS, capsSchema, { base: { entries: [] } })
    visionScope = sctx.settings.register(VISION_NS, visionSchema, {
      base: { baseURL: '', apiKey: '', model: '', enabled: false },
    })
  })

  // Wrap every registered provider adapter so user-declared modalities win.
  try {
    const llm = ctx.get('llm')
    if (llm?.listProviders !== undefined) {
      for (const provider of llm.listProviders()) {
        try {
          const registration = llm.registration?.(provider.id)
          if (registration?.adapter !== undefined) {
            llm.registerAdapter([provider.id], wrapAdapter(registration.adapter, readCaps))
          }
        } catch {
          // Provider route not replaceable; keep the official adapter.
        }
      }
    }
  } catch {
    // llm service unavailable; capability overrides simply do not apply.
  }

  ctx.tools.register(defineTool({
    name: 'desktop_vision',
    description: '使用用户配置的视觉模型查看一张本地图片并返回其内容描述。当用户消息引用了图片文件时，使用此工具理解图片内容。',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: '图片的绝对路径',
      },
    },
    async execute(args, exec) {
      const vision = readVision()
      if (vision.enabled !== true || vision.baseURL.length === 0 || vision.model.length === 0) {
        throw new Error('desktop_vision 未配置：请在「设置 → 视觉能力」中配置视觉模型后重试')
      }
      const data = await readFile(args.path)
      const response = await fetch(`${vision.baseURL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(vision.apiKey.length > 0 ? { authorization: `Bearer ${vision.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: vision.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: '请详细描述这张图片的内容，包括其中的文字、界面布局和关键细节。' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${data.toString('base64')}` } },
            ],
          }],
          max_tokens: 1024,
        }),
        ...(exec.signal !== undefined ? { signal: exec.signal } : {}),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`视觉请求失败（${response.status}）：${detail.slice(0, 500)}`)
      }
      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.length === 0) throw new Error('视觉模型未返回内容')
      return content
    },
    output: VISION_OUTPUT,
  }))

  ctx.systemPrompt?.section?.({
    name: 'desktop:vision',
    order: 200,
    text: '当用户消息中引用了图片文件（.png/.jpg/.jpeg/.webp/.gif）时，使用 desktop_vision 工具查看该图片并理解其内容。',
  })
}
