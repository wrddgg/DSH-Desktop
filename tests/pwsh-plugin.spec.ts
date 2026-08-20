import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DesktopPwshExecutor } from '../packages/dsh-desktop-pwsh/lib/index.js'

function makeContext(confine: (...args: unknown[]) => void): Context {
  const ctx = new Context()
  ctx.provide('subprocess', {
    spawn(): never {
      throw new Error('subprocess must not be reached in the plain-node negative test')
    },
  })
  ctx.provide('sandbox', { confine })
  ctx.provide('sandboxPolicy', {
    defaultMode: 'workspace-write',
    resolve: () => ({ mode: 'workspace-write', workspaceRoot: process.cwd() }),
  })
  return ctx
}

function makeExecutor(ctx: Context): DesktopPwshExecutor {
  return new DesktopPwshExecutor(ctx, {
    cwd: process.cwd(),
    timeoutMs: 60000,
    maxTimeoutMs: 120000,
    maxOutputBytes: 65536,
    maxSpillBytes: 67108864,
    graceMs: 5000,
    pwshPath: 'pwsh',
  })
}

describe('DesktopPwshExecutor outside Electron', () => {
  it('keeps the official confined semantics: sandboxMode from policy, run wraps via sandbox.confine', async () => {
    let confineCalls = 0
    const ctx = makeContext(() => {
      confineCalls += 1
      throw new Error('confine stub')
    })
    const executor = makeExecutor(ctx)
    expect(executor.sandboxMode).toBe('workspace-write')

    const spec = executor.resolve({ command: 'echo x', timeoutMs: 30000, workdir: process.cwd() })
    await expect(executor.run(spec)).rejects.toThrow('confine stub')
    expect(confineCalls).toBe(1)
  })
})

describe('DSH Desktop pwsh plugin package', () => {
  const pluginRoot = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-pwsh')

  it('declares the official bundle patch and its runtime dependencies', async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'package.json'), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies['@deepseek-ai/dsh-pwsh-local']).toBe('0.1.0-rc.7')
    expect(manifest.dependencies['@deepseek-ai/dsh-pwsh-sandbox']).toBe('0.1.0-rc.7')
  })

  it('inserts itself as a loader row', async () => {
    const patch = await readFile(resolve(pluginRoot, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@wrddgg/dsh-desktop-pwsh'")
  })

  it('ships the executor class as both named and default exports', async () => {
    const source = await readFile(resolve(pluginRoot, 'lib', 'index.js'), 'utf8')
    expect(source).toContain('class DesktopPwshExecutor extends SandboxPwshExecutor')
    expect(source).toContain('export default DesktopPwshExecutor')
    expect(source).toContain('process.versions.electron')
  })
})
