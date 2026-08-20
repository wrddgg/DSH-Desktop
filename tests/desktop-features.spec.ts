import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { modelSupportsImages } from '../packages/dsh-desktop-vision/src/vision-core.js'

describe('vision-core model capability decisions', () => {
  it('supports images only for declared multimodal entries', () => {
    expect(modelSupportsImages([
      { provider: 'deepseek', model: 'opus-5', modalities: ['image', 'text'] },
    ], 'deepseek', 'opus-5')).toBe(true)
    expect(modelSupportsImages([
      { provider: 'deepseek', model: 'opus-5', modalities: ['image', 'text'] },
    ], 'deepseek', 'other')).toBe(false)
    expect(modelSupportsImages([
      { provider: 'deepseek', model: 'x', modalities: ['text'] },
    ], 'deepseek', 'x')).toBe(false)
    expect(modelSupportsImages([], 'deepseek', 'opus-5')).toBe(false)
  })
})

describe('new desktop plugin packages', () => {
  it('model-cap declares its runtime dependencies and loader row', async () => {
    const root = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-model-cap')
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies['@deepseek-ai/dsh-llm']).toBe('0.1.0-rc.7')
    const source = await readFile(resolve(root, 'lib', 'index.js'), 'utf8')
    expect(source).toContain('desktop_vision')
    expect(source).toContain('registerAdapter')
  })

  it('vision ships the client bundle with settings pages and drop routing', async () => {
    const root = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-vision')
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    expect(manifest.dsh.client.platform).toBe('web')
    const client = await readFile(resolve(root, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('"@wrddgg/dsh-desktop-vision"')
    expect(client).toContain('desktopModelCapabilities')
    expect(client).toContain('desktopVision')
    expect(client).toContain('dshVisionWizard')
  })

  it('message-edit ships the client bundle with the user node replacement', async () => {
    const root = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-message-edit')
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    expect(manifest.dsh.client.platform).toBe('web')
    const client = await readFile(resolve(root, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('"@wrddgg/dsh-desktop-message-edit"')
    expect(client).toContain('"conversation.chat.node"')
    expect(client).toContain('双击编辑')
  })
})
