import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifyFiles,
  displayBasename,
  formatSize,
  isImageFile,
  isInsideRoot,
  quotePath,
  serializeFileRef,
  xmlEscape,
} from '../packages/dsh-desktop-file-ref/src/refs-core.js'

describe('file-ref classification', () => {
  it('recognizes images by media type and by extension fallback', () => {
    expect(isImageFile({ name: 'shot.png', type: 'image/png' })).toBe(true)
    expect(isImageFile({ name: 'shot.png', type: '' })).toBe(true)
    expect(isImageFile({ name: 'photo.JPG', type: '' })).toBe(true)
    expect(isImageFile({ name: 'auth.ts', type: '' })).toBe(false)
    expect(isImageFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false)
  })

  it('splits mixed drops into images and others', () => {
    const { images, others } = classifyFiles([
      { name: 'a.png', type: 'image/png' },
      { name: 'b.ts', type: '' },
      { name: 'c.jpg', type: '' },
    ])
    expect(images.map(file => file.name)).toEqual(['a.png', 'c.jpg'])
    expect(others.map(file => file.name)).toEqual(['b.ts'])
  })
})

describe('file-ref serialization', () => {
  it('serializes directories as path-only references with a listing instruction', async () => {
    const text = await serializeFileRef({ path: 'C:\\proj\\src', kind: 'dir' }, async () => {
      throw new Error('should not read directories')
    })
    expect(text).toContain('kind="dir"')
    expect(text).toContain('C:\\proj\\src')
    expect(text).toContain('列出该目录')
  })

  it('inlines small text files', async () => {
    const text = await serializeFileRef(
      { path: 'C:\\proj\\auth.ts', kind: 'file', size: 12 },
      async () => ({ ok: true, content: 'const x = 1', binary: false, truncated: false }),
    )
    expect(text).toContain('const x = 1')
    expect(text).toContain('C:\\proj\\auth.ts')
  })

  it('keeps large files path-only with a read instruction', async () => {
    const text = await serializeFileRef(
      { path: 'C:\\proj\\big.ts', kind: 'file', size: 100_000 },
      async () => {
        throw new Error('should not read large files')
      },
    )
    expect(text).toContain('kind="file"')
    expect(text).toContain('size="100000"')
    expect(text).toContain('文件读取工具')
  })

  it('marks binary files without inlining', async () => {
    const text = await serializeFileRef(
      { path: 'C:\\proj\\app.exe', kind: 'file', size: 10 },
      async () => ({ ok: true, binary: true, truncated: false }),
    )
    expect(text).toContain('binary="true"')
    expect(text).toContain('二进制')
  })

  it('marks out-of-workspace files read-only', async () => {
    const text = await serializeFileRef(
      { path: 'C:\\elsewhere\\x.ts', kind: 'file', size: 100, readonly: true },
      async () => ({ ok: true, content: 'x', binary: false, truncated: false }),
    )
    expect(text).toContain('readonly="true"')
  })

  it('blocks the send when a referenced file cannot be read', async () => {
    await expect(serializeFileRef(
      { path: 'C:\\proj\\gone.ts', kind: 'file', size: 5 },
      async () => ({ ok: false }),
    )).rejects.toThrow('无法读取引用文件')
  })
})

describe('file-ref helpers', () => {
  it('escapes XML control characters', () => {
    expect(xmlEscape('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;')
  })

  it('derives display basenames from Windows and POSIX paths', () => {
    expect(displayBasename('C:\\proj\\src\\auth.ts')).toBe('auth.ts')
    expect(displayBasename('/home/u/x/y.txt')).toBe('y.txt')
    expect(displayBasename('C:\\proj\\src\\')).toBe('src')
  })

  it('quotes clipboard projections', () => {
    expect(quotePath('C:\\proj\\a b.ts')).toBe('"C:\\proj\\a b.ts"')
  })

  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('decides workspace membership case-insensitively', () => {
    expect(isInsideRoot('C:\\Proj\\src\\a.ts', 'c:\\proj')).toBe(true)
    expect(isInsideRoot('C:\\other\\a.ts', 'C:\\proj')).toBe(false)
    expect(isInsideRoot('a.ts', undefined)).toBe(false)
  })
})

describe('DSH Desktop file-ref plugin package', () => {
  const pluginRoot = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-file-ref')

  it('declares the official bundle and browser client faces', async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'package.json'), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
  })

  it('ships the lazy-CJS client factory required by DSH', async () => {
    const client = await readFile(resolve(pluginRoot, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('window.__ModuleLoader__')
    expect(client).toContain('"@wrddgg/dsh-desktop-file-ref"')
    expect(client).toContain('"conversation.input.left"')
    expect(client).toContain('workspace-files')
  })
})
