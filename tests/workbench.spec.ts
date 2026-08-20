import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  basename,
  formatBytes,
  gitStatusLabel,
  joinPath,
  parentOf,
  stripAnsi,
} from '../packages/dsh-desktop-workbench/src/workbench-core.js'

describe('workbench-core stripAnsi', () => {
  it('removes CSI color codes and OSC sequences', () => {
    expect(stripAnsi('\u001B[32mgreen\u001B[0m plain')).toBe('green plain')
    expect(stripAnsi('before\u001B]0;title\u0007after')).toBe('beforeafter')
    expect(stripAnsi('a\r\nb')).toBe('a\nb')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('dir\r\nVolume in drive C')).toBe('dir\nVolume in drive C')
  })
})

describe('workbench-core path helpers', () => {
  it('joins paths with the existing separator style', () => {
    expect(joinPath('C:\\proj', 'src')).toBe('C:\\proj\\src')
    expect(joinPath('/home/u/', 'x')).toBe('/home/u/x')
  })

  it('derives parents and basenames', () => {
    expect(parentOf('C:\\proj\\src\\a.ts')).toBe('C:\\proj\\src')
    expect(parentOf('C:\\proj')).toBeUndefined()
    expect(basename('/home/u/x/y.txt')).toBe('y.txt')
  })
})

describe('workbench-core git labels', () => {
  it('labels staged and unstaged porcelain codes', () => {
    expect(gitStatusLabel({ path: 'a.ts', status: 'M ', staged: true })).toBe('已修改')
    expect(gitStatusLabel({ path: 'b.ts', status: ' M', staged: false })).toBe('已修改')
    expect(gitStatusLabel({ path: 'c.ts', status: '??', staged: false })).toBe('未跟踪')
    expect(gitStatusLabel({ path: 'd.ts', status: 'A ', staged: true })).toBe('已添加')
    expect(gitStatusLabel({ path: 'e.ts', status: 'D ', staged: true })).toBe('已删除')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2 KB')
  })
})

describe('DSH Desktop workbench plugin package', () => {
  const pluginRoot = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-workbench')

  it('declares the official bundle and browser client faces', async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'package.json'), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
  })

  it('ships the lazy-CJS client factory required by DSH', async () => {
    const client = await readFile(resolve(pluginRoot, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('window.__ModuleLoader__')
    expect(client).toContain('"@wrddgg/dsh-desktop-workbench"')
    expect(client).toContain('"shell.overlay"')
    expect(client).toContain('"conversation.input.right"')
    expect(client).toContain('dshWorkbenchPanel')
    expect(client).toContain('工作台')
  })
})
