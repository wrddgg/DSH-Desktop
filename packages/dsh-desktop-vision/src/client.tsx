/**
 * DSH Desktop Vision On Demand client plugin.
 *
 * - Settings pages: 模型能力 (per-model vision/text declaration) and
 *   视觉能力 (vision provider: OpenAI-compatible baseURL/apiKey/model).
 * - Image-drop routing: when the current model is text-only, dropped images
 *   become file references (the model reads them via the desktop_vision
 *   tool); when no vision provider is configured yet, a setup wizard opens
 *   first (PRD P0-11 flow).
 * - All settings are mirrored to localStorage so the client can route drops
 *   without a settings read-back RPC.
 */
import { displayBasename, modelSupportsImages, quotePath, type CapEntry } from './vision-core'

declare global {
  interface Window {
    __ModuleLoader__?: {
      load(handoff: { id: string; factory: (require: (spec: string) => any) => any }): void
    }
    dshDesktop?: any
  }
}

const PLUGIN_ID = '@wrddgg/dsh-desktop-vision'
const CAPS_NS = 'desktop-model-capabilities'
const VISION_NS = 'desktop-vision'
const CAPS_STORAGE = 'dshDesktopModelCaps'
const VISION_STORAGE = 'dshDesktopVision'

window.__ModuleLoader__?.load({
  id: PLUGIN_ID,
  factory: (require) => {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const IconCloseOutline16 = primitives?.IconCloseOutline16

    const styleId = 'dsh-desktop-vision-styles'
    const styles = `
      .dshVisionWizard{position:fixed;z-index:70;top:50%;left:50%;width:min(520px,calc(100vw - 40px));transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-0);border:1px solid var(--dsw-alias-line-border);border-radius:16px;box-shadow:0 24px 70px rgba(10,30,60,.28)}
      .dshVisionWizard__header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-line-border)}
      .dshVisionWizard__title{flex:1;font-size:14px;font-weight:650}
      .dshVisionWizard__body{padding:14px 16px}
      .dshVisionWizard__lead{margin:0 0 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
      .dshVisionWizard__field{display:grid;gap:5px;margin-bottom:10px}
      .dshVisionWizard__field label{color:var(--dsw-alias-label-secondary);font-size:11px}
      .dshVisionWizard__field input{height:32px;padding:4px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:8px;font:12px/1.5 inherit}
      .dshVisionWizard__actions{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-line-border)}
      .dshVisionWizard button{min-height:32px;padding:5px 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:8px;font:600 12px/18px inherit;cursor:pointer}
      .dshVisionWizard button[data-primary="true"]{color:#fff;background:#4176e6;border-color:#4176e6}
      .dshVisionWizard button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshVisionCaps table{width:100%;border-collapse:collapse;font-size:12px}
      .dshVisionCaps th,.dshVisionCaps td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--dsw-alias-line-border)}
      .dshVisionCaps input[type="text"]{height:28px;padding:2px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:6px;font:12px/1.5 inherit}
      .dshVisionCaps button{min-height:26px;padding:3px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:7px;font:600 11px/18px inherit;cursor:pointer}
      .dshVisionCaps button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshVisionCaps__add{display:flex;gap:6px;margin-top:10px}
    `

    function ensureStyles() {
      if (document.getElementById(styleId)) return
      const tag = document.createElement('style')
      tag.id = styleId
      tag.dataset.plugin = PLUGIN_ID
      tag.textContent = styles
      document.head.appendChild(tag)
    }

    // ------------------------------------------------------------------
    // Settings persistence: official settings namespace (host reads it) +
    // localStorage mirror (client reads it for drop routing).
    // ------------------------------------------------------------------
    interface VisionConfig { baseURL: string; apiKey: string; model: string; enabled: boolean }

    function loadCaps(): CapEntry[] {
      try {
        const raw = window.localStorage.getItem(CAPS_STORAGE)
        if (raw !== null) return JSON.parse(raw) as CapEntry[]
      } catch { /* ignore */ }
      return []
    }

    function saveCaps(entries: CapEntry[]): void {
      try { window.localStorage.setItem(CAPS_STORAGE, JSON.stringify(entries)) } catch { /* ignore */ }
    }

    function loadVision(): VisionConfig {
      try {
        const raw = window.localStorage.getItem(VISION_STORAGE)
        if (raw !== null) return JSON.parse(raw) as VisionConfig
      } catch { /* ignore */ }
      return { baseURL: '', apiKey: '', model: '', enabled: false }
    }

    function saveVision(config: VisionConfig): void {
      try { window.localStorage.setItem(VISION_STORAGE, JSON.stringify(config)) } catch { /* ignore */ }
    }

    function modelSupportsImagesFor(provider: string, model: string): boolean {
      return modelSupportsImages(loadCaps(), provider, model)
    }

    function visionConfigured(): boolean {
      const config = loadVision()
      return config.enabled === true && config.baseURL.length > 0 && config.model.length > 0
    }

    // ------------------------------------------------------------------
    // Shared wizard state.
    // ------------------------------------------------------------------
    interface PendingImages { files: File[]; sessionId: string | undefined }
    const wizardStore = {
      open: false,
      pending: undefined as PendingImages | undefined,
      listeners: new Set<(open: boolean) => void>(),
      subscribe(listener: (open: boolean) => void) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      emit() {
        for (const listener of this.listeners) listener(this.open)
      },
      show(pending: PendingImages) {
        this.pending = pending
        this.open = true
        this.emit()
      },
      close() {
        this.open = false
        this.pending = undefined
        this.emit()
      },
    }

    // Latest input machine snapshot, kept fresh by the session-scoped router
    // so the root-scoped wizard can build valid span CAS values.
    const inputSnapshot = { draft: '', draftRev: 0 }
    function readCaret(): number {
      const element = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null
      if (element !== null && element.tagName === 'TEXTAREA') {
        const start = element.selectionStart
        if (typeof start === 'number' && start <= inputSnapshot.draft.length) return start
      }
      return inputSnapshot.draft.length
    }

    function apply(ctx: any): void {
      const api = window.dshDesktop
      if (!api) return
      const connection = ctx.get?.('connection')
      const hostApi = connection?.api
      ensureStyles()

      // ------------------------------------------------------------------
      // Drop routing component (session-scoped, invisible).
      // ------------------------------------------------------------------
      function VisionDropRouter(props: any) {
        const sessionId = props?.sessionId
        const sessionRef = React.useRef<string | undefined>(sessionId)
        sessionRef.current = sessionId

        // Live input machine state for span CAS (owner InputZone snapshot).
        const inputRef = React.useRef({ draft: '', draftRev: 0 })
        inputRef.current = { draft: props?.input?.draft ?? '', draftRev: props?.input?.draftRev ?? 0 }
        inputSnapshot.draft = inputRef.current.draft
        inputSnapshot.draftRev = inputRef.current.draftRev

        const insertRefs = React.useCallback((paths: readonly string[], id: string | undefined) => {
          if (id === undefined) return false
          const actx = ctx.sessions?.scope?.(id)
          if (!actx) return false
          const caret = readCaret()
          let ok = false
          for (const path of paths) {
            try {
              const applied = actx.bail(actx, 'slash/input-insert-reference', {
                reference: {
                  source: 'workspace-files',
                  ref: path,
                  label: displayBasename(path),
                  clipboardText: quotePath(path),
                },
                span: { start: caret, end: caret, draftRev: inputSnapshot.draftRev },
              }) === true
              ok = ok || applied
              inputSnapshot.draftRev += 1
            } catch {
              // per-chip failure tolerated
            }
          }
          return ok
        }, [])

        const routeImages = React.useCallback((files: readonly File[], id: string | undefined) => {
          const paths: string[] = []
          for (const file of files) {
            try {
              const path = typeof api.getPathForFile === 'function' ? api.getPathForFile(file) ?? '' : ''
              if (path.length > 0) paths.push(path)
            } catch {
              // skip unreadable
            }
          }
          if (paths.length === 0) return
          if (visionConfigured()) {
            insertRefs(paths, id)
          } else {
            wizardStore.show({ files: [...files], sessionId: id })
          }
        }, [insertRefs])

        // Track whether the current model is text-only (async, per session).
        const modelRef = React.useRef<{ textOnly: boolean }>({ textOnly: false })
        React.useEffect(() => {
          const id = sessionRef.current
          if (id === undefined || hostApi?.sessions?.models === undefined) return
          let cancelled = false
          void hostApi.sessions.models({ sessionId: id }).then((result: any) => {
            if (cancelled) return
            const current = result?.current
            modelRef.current = { textOnly: current === undefined ? false : !modelSupportsImagesFor(current.provider, current.model) }
          }).catch(() => {
            if (!cancelled) modelRef.current = { textOnly: false }
          })
          return () => { cancelled = true }
        }, [sessionId])

        React.useEffect(() => {
          const filesOf = (event: DragEvent): File[] => {
            const transfer = event.dataTransfer
            if (transfer === null || !Array.from(transfer.types).includes('Files')) return []
            return [...(transfer.files ?? [])]
          }
          const imagesOf = (files: readonly File[]): File[] =>
            files.filter(file => (file.type ?? '').startsWith('image/'))
          const onDrop = (event: DragEvent) => {
            if (!modelRef.current.textOnly) return
            const files = filesOf(event)
            if (files.length === 0) return
            const images = imagesOf(files)
            if (images.length === 0) return
            event.preventDefault()
            event.stopImmediatePropagation()
            routeImages(images, sessionRef.current)
          }
          document.addEventListener('drop', onDrop, true)
          return () => document.removeEventListener('drop', onDrop, true)
        }, [routeImages])

        return null
      }

      // ------------------------------------------------------------------
      // Vision setup wizard overlay.
      // ------------------------------------------------------------------
      function VisionWizard() {
        ensureStyles()
        const [open, setOpen] = React.useState(wizardStore.open)
        React.useEffect(() => wizardStore.subscribe(setOpen), [])
        const [baseURL, setBaseURL] = React.useState('')
        const [apiKey, setApiKey] = React.useState('')
        const [model, setModel] = React.useState('')
        const [saving, setSaving] = React.useState(false)
        if (!open) return null

        const saveAndProceed = async (asRefs: boolean) => {
          setSaving(true)
          try {
            const config = { baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim(), enabled: true }
            saveVision(config)
            if (hostApi?.settings?.update !== undefined) {
              try {
                await hostApi.settings.update({ ns: VISION_NS, patch: config })
              } catch {
                // host namespace may be unavailable; localStorage still routes
              }
            }
            const pending = wizardStore.pending
            wizardStore.close()
            if (asRefs && pending !== undefined && pending.files.length > 0) {
              const paths: string[] = []
              for (const file of pending.files) {
                try {
                  const path = typeof api.getPathForFile === 'function' ? api.getPathForFile(file) ?? '' : ''
                  if (path.length > 0) paths.push(path)
                } catch { /* skip */ }
              }
              if (paths.length > 0) {
                const actx = pending.sessionId === undefined ? undefined : ctx.sessions?.scope?.(pending.sessionId)
                if (actx !== undefined) {
                  const caret = readCaret()
                  for (const path of paths) {
                    try {
                      actx.bail(actx, 'slash/input-insert-reference', {
                        reference: { source: 'workspace-files', ref: path, label: displayBasename(path), clipboardText: quotePath(path) },
                        span: { start: caret, end: caret, draftRev: inputSnapshot.draftRev },
                      })
                      inputSnapshot.draftRev += 1
                    } catch { /* ignore */ }
                  }
                }
              }
            }
          } finally {
            setSaving(false)
          }
        }

        return React.createElement('div', { className: 'dshVisionWizard', role: 'dialog', 'aria-label': '视觉能力' },
          React.createElement('header', { className: 'dshVisionWizard__header' },
            React.createElement('span', { className: 'dshVisionWizard__title' }, '需要视觉能力'),
            React.createElement('button', { type: 'button', onClick: () => wizardStore.close(), 'aria-label': '关闭' },
              IconCloseOutline16 ? React.createElement(IconCloseOutline16, { size: 15 }) : '×'),
          ),
          React.createElement('div', { className: 'dshVisionWizard__body' },
            React.createElement('p', { className: 'dshVisionWizard__lead' },
              '当前模型无法直接理解图片。配置一个视觉模型后，图片会以文件引用的方式交给模型，由 desktop_vision 工具读取并描述。',
            ),
            React.createElement('div', { className: 'dshVisionWizard__field' },
              React.createElement('label', { htmlFor: 'vision-base-url' }, '视觉 API 地址（OpenAI 兼容，如 https://api.example.com/v1）'),
              React.createElement('input', { id: 'vision-base-url', value: baseURL, placeholder: 'https://…/v1', onChange: (e: any) => setBaseURL(e.target.value) }),
            ),
            React.createElement('div', { className: 'dshVisionWizard__field' },
              React.createElement('label', { htmlFor: 'vision-api-key' }, 'API Key'),
              React.createElement('input', { id: 'vision-api-key', type: 'password', value: apiKey, placeholder: 'sk-…', onChange: (e: any) => setApiKey(e.target.value) }),
            ),
            React.createElement('div', { className: 'dshVisionWizard__field' },
              React.createElement('label', { htmlFor: 'vision-model' }, '视觉模型'),
              React.createElement('input', { id: 'vision-model', value: model, placeholder: '如 glm-4v-flash / gpt-4o-mini', onChange: (e: any) => setModel(e.target.value) }),
            ),
          ),
          React.createElement('div', { className: 'dshVisionWizard__actions' },
            React.createElement('button', { type: 'button', 'data-primary': 'true', disabled: saving || baseURL.trim() === '' || model.trim() === '', onClick: () => void saveAndProceed(true) }, '保存并作为图片引用'),
            React.createElement('button', { type: 'button', disabled: saving, onClick: () => void saveAndProceed(false) }, '仅保存配置'),
            React.createElement('button', { type: 'button', disabled: saving, onClick: () => wizardStore.close() }, '取消'),
          ),
        )
      }

      // ------------------------------------------------------------------
      // Settings page: model capabilities.
      // ------------------------------------------------------------------
      function ModelCapabilitiesSection() {
        ensureStyles()
        const [entries, setEntries] = React.useState<CapEntry[]>(loadCaps())
        const [provider, setProvider] = React.useState('deepseek')
        const [model, setModel] = React.useState('')
        const [vision, setVision] = React.useState(false)

        const persist = (next: CapEntry[]) => {
          setEntries(next)
          saveCaps(next)
          if (hostApi?.settings?.update !== undefined) {
            void hostApi.settings.update({ ns: CAPS_NS, patch: { entries: next } }).catch(() => undefined)
          }
        }

        const add = () => {
          if (model.trim() === '') return
          const next = [...entries.filter(entry => !(entry.provider === provider.trim() && entry.model === model.trim())),
            { provider: provider.trim(), model: model.trim(), modalities: vision ? ['image', 'text'] : ['text'] }]
          persist(next)
          setModel('')
          setVision(false)
        }

        const remove = (index: number) => persist(entries.filter((_, i) => i !== index))
        const toggle = (index: number) => {
          const next = entries.map((entry, i) => i === index
            ? { ...entry, modalities: entry.modalities.includes('image') ? ['text'] : ['image', 'text'] }
            : entry)
          persist(next)
        }

        return React.createElement('div', { className: 'dshVisionCaps' },
          React.createElement('table', null,
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, 'Provider'),
              React.createElement('th', null, '模型'),
              React.createElement('th', null, '支持图片'),
              React.createElement('th', null, ''),
            )),
            React.createElement('tbody', null,
              entries.map((entry, index) => React.createElement('tr', { key: `${entry.provider}:${entry.model}` },
                React.createElement('td', null, entry.provider),
                React.createElement('td', null, entry.model),
                React.createElement('td', null, React.createElement('input', {
                  type: 'checkbox',
                  checked: entry.modalities.includes('image'),
                  onChange: () => toggle(index),
                })),
                React.createElement('td', null, React.createElement('button', { type: 'button', onClick: () => remove(index) }, '删除')),
              )),
              entries.length === 0 ? React.createElement('tr', null, React.createElement('td', { colSpan: 4 }, '尚未声明任何模型能力。默认情况下，未声明的模型按纯文本处理（图片将走视觉桥）。')) : null,
            ),
          ),
          React.createElement('div', { className: 'dshVisionCaps__add' },
            React.createElement('input', { type: 'text', value: provider, placeholder: 'provider（默认 deepseek）', onChange: (e: any) => setProvider(e.target.value) }),
            React.createElement('input', { type: 'text', value: model, placeholder: '模型名，如 opus-5', onChange: (e: any) => setModel(e.target.value) }),
            React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: vision, onChange: (e: any) => setVision(e.target.checked) }), ' 多模态'),
            React.createElement('button', { type: 'button', onClick: add }, '添加'),
          ),
        )
      }

      // ------------------------------------------------------------------
      // Settings page: vision provider.
      // ------------------------------------------------------------------
      function VisionSection() {
        ensureStyles()
        const [config, setConfig] = React.useState<VisionConfig>(loadVision())
        const persist = (next: VisionConfig) => {
          setConfig(next)
          saveVision(next)
          if (hostApi?.settings?.update !== undefined) {
            void hostApi.settings.update({ ns: VISION_NS, patch: next }).catch(() => undefined)
          }
        }
        const field = (labelText: string, key: 'baseURL' | 'apiKey' | 'model', password = false) => React.createElement('div', { className: 'dshVisionWizard__field' },
          React.createElement('label', { htmlFor: `vision-${key}` }, labelText),
          React.createElement('input', {
            id: `vision-${key}`,
            type: password ? 'password' : 'text',
            value: config[key],
            placeholder: key === 'baseURL' ? 'https://…/v1' : key === 'apiKey' ? 'sk-…' : '如 glm-4v-flash',
            onChange: (e: any) => persist({ ...config, [key]: e.target.value }),
          }),
        )
        return React.createElement('div', { className: 'dshVisionWizard' },
          React.createElement('div', { className: 'dshVisionWizard__body' },
            React.createElement('p', { className: 'dshVisionWizard__lead' },
              '当主模型为纯文本模型时，图片会以文件引用交给模型，模型通过 desktop_vision 工具调用此视觉模型理解图片。',
            ),
            field('视觉 API 地址（OpenAI 兼容）', 'baseURL'),
            field('API Key', 'apiKey', true),
            field('视觉模型', 'model'),
            React.createElement('label', { className: 'dshVisionWizard__field' },
              React.createElement('input', { type: 'checkbox', checked: config.enabled, onChange: (e: any) => persist({ ...config, enabled: e.target.checked }) }),
              ' 启用视觉桥',
            ),
          ),
        )
      }

      // ------------------------------------------------------------------
      // Registrations.
      // ------------------------------------------------------------------
      try {
        ctx.slots.inject('conversation.input.left', function* () {
          yield ctx.slots.register({ name: 'conversation.input.left', id: 'desktop-vision-router', order: 90, label: '视觉路由' }, VisionDropRouter)
        })
      } catch (error) {
        console.warn('[dsh-desktop-vision] composer slot unavailable', error)
      }
      try {
        ctx.slots.inject('shell.overlay', function* () {
          yield ctx.slots.register({ name: 'shell.overlay', id: 'desktop-vision-wizard', order: 65 }, VisionWizard)
        })
      } catch (error) {
        console.warn('[dsh-desktop-vision] overlay slot unavailable', error)
      }
      try {
        ctx.slots.inject('settings.section', function* () {
          yield ctx.slots.register({ name: 'settings.section', id: 'desktop-model-capabilities', order: 70, label: '模型能力' }, ModelCapabilitiesSection)
          yield ctx.slots.register({ name: 'settings.section', id: 'desktop-vision', order: 71, label: '视觉能力' }, VisionSection)
        })
      } catch (error) {
        console.warn('[dsh-desktop-vision] settings slot unavailable', error)
      }
    }

    return { apply, inject: [] }
  },
})
