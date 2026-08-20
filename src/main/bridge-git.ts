import { spawn } from 'node:child_process'
import type {
  GitRunResult,
  GitStatusEntry,
  GitStatusResult,
} from '../shared/contracts.js'

const GIT_TIMEOUT_MS = 30_000

function run(
  cwd: string,
  args: string[],
  options?: { timeoutMs?: number },
): Promise<GitRunResult> {
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: GitRunResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, code: -1, message: `git 命令超时（${options?.timeoutMs ?? GIT_TIMEOUT_MS}ms）` })
    }, options?.timeoutMs ?? GIT_TIMEOUT_MS)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    child.stderr?.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      finish({ ok: false, message: `git 不可用：${error.message}` })
    })
    child.on('exit', code => {
      clearTimeout(timer)
      finish(code === 0 ? { ok: true, stdout, stderr, code } : { ok: false, stdout, stderr, code: code ?? -1, message: stderr.trim() || `git 退出码 ${code ?? 'unknown'}` })
    })
  })
}

/**
 * Git bridge: thin wrapper over the system git binary for the Workbench Git
 * tab. Callers pass the workspace directory; this class performs no state
 * of its own.
 */
export class GitBridge {
  public async isRepo(cwd: string): Promise<{ ok: boolean; isRepo?: boolean; message?: string }> {
    const result = await run(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (!result.ok) return { ok: true, isRepo: false }
    return { ok: true, isRepo: result.stdout?.trim() === 'true' }
  }

  public async status(cwd: string): Promise<GitStatusResult> {
    const branch = await run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const porcelain = await run(cwd, ['status', '--porcelain=v1', '-z'])
    if (!porcelain.ok) return { ok: false, message: porcelain.message ?? 'git status 失败' }
    const entries: GitStatusEntry[] = []
    const raw = porcelain.stdout ?? ''
    let index = 0
    while (index < raw.length) {
      const x = raw[index]
      const y = raw[index + 1]
      if (x === undefined || y === undefined) break
      index += 3 // X, Y, space
      let path = ''
      while (index < raw.length) {
        const char = raw[index]
        if (char === '\0') break
        path += char
        index += 1
      }
      index += 1
      if (path.length === 0) continue
      entries.push({ path, status: `${x}${y}`.trim(), staged: x !== ' ' })
    }
    entries.sort((a, b) => a.path.localeCompare(b.path))
    const branchName = branch.ok ? branch.stdout?.trim() : undefined
    return branchName === undefined
      ? { ok: true, entries }
      : { ok: true, branch: branchName, entries }
  }

  public async diff(cwd: string, options?: { path?: string; staged?: boolean }): Promise<{ ok: boolean; text?: string; message?: string }> {
    const args = ['diff', ...(options?.staged === true ? ['--cached'] : []), '--', ...(options?.path !== undefined ? [options.path] : [])]
    const result = await run(cwd, args)
    if (!result.ok) return { ok: false, message: result.message ?? 'git diff 失败' }
    return { ok: true, text: result.stdout ?? '' }
  }

  public async stage(cwd: string, paths: string[]): Promise<GitRunResult> {
    if (paths.length === 0) return { ok: true, stdout: '' }
    return run(cwd, ['add', '--', ...paths])
  }

  public async unstage(cwd: string, paths: string[]): Promise<GitRunResult> {
    if (paths.length === 0) return { ok: true, stdout: '' }
    return run(cwd, ['reset', 'HEAD', '--', ...paths])
  }

  public async commit(cwd: string, message: string): Promise<GitRunResult> {
    const trimmed = message.trim()
    if (trimmed.length === 0) return { ok: false, message: '提交信息不能为空' }
    return run(cwd, ['commit', '-m', trimmed])
  }
}
