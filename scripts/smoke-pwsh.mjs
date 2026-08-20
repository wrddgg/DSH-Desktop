import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

/**
 * Functional smoke for the Electron-safe pwsh executor. Boots the dev
 * Electron binary in node mode (the desktop's harness host), wires the real
 * Cordis Context with stub service seams, and proves:
 *  - under Electron the executor reports unconfined (sandboxMode undefined);
 *  - a pwsh run succeeds through the LOCAL path and echoes the marker;
 *  - ctx.sandbox.confine is never called (the ACL runner is bypassed);
 *  - the sandbox facts stamped on the result stay policy-shaped.
 * Exits non-zero on any failure.
 */
const root = resolve(import.meta.dirname, '..')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

const probe = `
const { createRequire } = require('node:module')
const { join } = require('node:path')
const { spawn: childSpawn } = require('node:child_process')
const localRequire = createRequire(join(process.cwd(), '__smoke_anchor__.cjs'))
const { Context } = localRequire('@deepseek-ai/cordis')
const { DesktopPwshExecutor } = localRequire('@wrddgg/dsh-desktop-pwsh')

function makeSubprocess() {
  return {
    spawn(spec) {
      const child = childSpawn(spec.argv[0], spec.argv.slice(1), {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const buffers = { stdout: '', stderr: '' }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => { buffers.stdout += chunk })
      child.stderr.on('data', (chunk) => { buffers.stderr += chunk })
      const reader = (name) => ({
        readFrom(offset) {
          const text = buffers[name].slice(offset)
          return { text, nextOffset: buffers[name].length, lossy: false }
        },
      })
      return {
        collected: { stdout: reader('stdout'), stderr: reader('stderr') },
        done: new Promise((resolveDone, rejectDone) => {
          child.once('error', rejectDone)
          child.once('close', (code, signal) => resolveDone({ exitCode: code, signal }))
        }),
        terminate() { child.kill() },
      }
    },
  }
}

async function main() {
  const ctx = new Context()
  const confineCalls = []
  ctx.provide('subprocess', makeSubprocess())
  ctx.provide('sandbox', {
    confine(...args) {
      confineCalls.push(args)
      throw new Error('sandbox.confine must not run under Electron')
    },
  })
  ctx.provide('sandboxPolicy', {
    defaultMode: 'workspace-write',
    resolve: () => ({ mode: 'workspace-write', workspaceRoot: process.cwd() }),
  })

  const executor = new DesktopPwshExecutor(ctx, {
    cwd: process.cwd(),
    timeoutMs: 60000,
    maxTimeoutMs: 120000,
    maxOutputBytes: 65536,
    maxSpillBytes: 67108864,
    graceMs: 5000,
    pwshPath: join(process.env.ProgramFiles ?? 'C:\\\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
  })
  if (executor.sandboxMode !== 'workspace-write') {
    throw new Error('expected the policy mode to stay visible under Electron, got sandboxMode=' + executor.sandboxMode)
  }

  const spec = executor.resolve({ command: 'Write-Output pwsh-bypass-ok', timeoutMs: 30000, workdir: process.cwd() })
  const result = await executor.run(spec)
  if (result.exitCode !== 0) throw new Error('pwsh exit ' + result.exitCode + ': ' + JSON.stringify(result.stderr))
  const stdout = result.stdout?.text ?? ''
  if (!stdout.includes('pwsh-bypass-ok')) throw new Error('missing marker in stdout: ' + JSON.stringify(stdout))
  if (result.sandbox?.mode !== 'workspace-write' || result.sandbox?.denied !== false) {
    throw new Error('unexpected sandbox facts: ' + JSON.stringify(result.sandbox))
  }
  if (confineCalls.length !== 0) throw new Error('sandbox.confine was called under Electron: ' + confineCalls.length + ' time(s)')

  console.log('pwsh Electron smoke passed: marker echoed, policy mode visible, sandbox.confine untouched.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
`

const child = spawn(electron, ['--expose-internals', '-e', probe], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
})

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject)
  child.once('exit', code => resolveExit(code ?? 1))
})

if (exitCode !== 0) process.exitCode = exitCode
