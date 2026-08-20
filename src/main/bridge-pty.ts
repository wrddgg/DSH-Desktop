import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export interface PtyCreateResult {
  ok: boolean
  id?: string
  message?: string
}

export interface PtySessionSummary {
  id: string
  cwd: string
  shell: string
  cols: number
  rows: number
}

type PtyModule = typeof import('node-pty')

/**
 * Interactive terminal bridge for the Workbench Terminal tab. Reuses the
 * node-pty binary already shipped inside the pinned DSH runtime, so the
 * desktop package needs no native dependency of its own. Sessions live in
 * the main process; output and exit events are pushed to the renderer.
 */
export class PtyBridge extends EventEmitter {
  readonly #pty: PtyModule | undefined
  readonly #sessions = new Map<string, import('node-pty').IPty>()
  readonly #meta = new Map<string, { cwd: string; shell: string }>()

  public constructor(options: { pty?: PtyModule; fallbackCwd: string }) {
    super()
    this.#pty = options.pty ?? resolveNodePty()
    this.fallbackCwd = options.fallbackCwd
  }

  readonly fallbackCwd: string

  public get available(): boolean {
    return this.#pty !== undefined
  }

  public list(): PtySessionSummary[] {
    const summaries: PtySessionSummary[] = []
    for (const [id, session] of this.#sessions) {
      const meta = this.#meta.get(id)
      summaries.push({
        id,
        cwd: meta?.cwd ?? '',
        shell: meta?.shell ?? '',
        cols: session.cols,
        rows: session.rows,
      })
    }
    return summaries
  }

  public create(options: { cwd?: string; cols?: number; rows?: number; shell?: string }): PtyCreateResult {
    if (this.#pty === undefined) {
      return { ok: false, message: 'node-pty 不可用：请重新安装 DSH Desktop（缺少终端组件）' }
    }
    const cwd = typeof options.cwd === 'string' && existsSync(options.cwd)
      ? options.cwd
      : existsSync(this.fallbackCwd)
        ? this.fallbackCwd
        : process.cwd()
    const shell = options.shell ?? process.env.ComSpec ?? 'cmd.exe'
    const cols = Math.max(20, Math.min(500, options.cols ?? 80))
    const rows = Math.max(5, Math.min(200, options.rows ?? 24))

    try {
      const session = this.#pty.spawn(shell, ['/d', '/s'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env } as Record<string, string>,
      })
      const id = String(session.pid)
      this.#sessions.set(id, session)
      this.#meta.set(id, { cwd, shell })
      session.onData((data: string) => this.emit('data', id, data))
      session.onExit(({ exitCode }: { exitCode: number }) => {
        this.#sessions.delete(id)
        this.#meta.delete(id)
        this.emit('exit', id, exitCode)
      })
      return { ok: true, id }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public write(id: string, data: string): { ok: boolean; message?: string } {
    const session = this.#sessions.get(id)
    if (session === undefined) return { ok: false, message: `终端会话不存在：${id}` }
    try {
      session.write(data)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public resize(id: string, cols: number, rows: number): { ok: boolean; message?: string } {
    const session = this.#sessions.get(id)
    if (session === undefined) return { ok: false, message: `终端会话不存在：${id}` }
    try {
      session.resize(Math.max(20, Math.min(500, cols)), Math.max(5, Math.min(200, rows)))
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public kill(id: string): { ok: boolean; message?: string } {
    const session = this.#sessions.get(id)
    if (session === undefined) return { ok: true }
    try {
      session.kill()
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public dispose(): void {
    for (const session of this.#sessions.values()) {
      try {
        session.kill()
      } catch {
        // best effort teardown
      }
    }
    this.#sessions.clear()
  }
}

function resolveNodePty(): PtyModule | undefined {
  const candidates = [
    join(process.resourcesPath ?? '', 'dsh-runtime', 'node_modules', 'node-pty'),
    join(process.cwd(), 'runtime-resources', 'node_modules', 'node-pty'),
  ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json'))) {
      // Anchor on an absolute path: import.meta.url is unavailable in the
      // bundled CJS output, and requiring by absolute directory path makes
      // the anchor irrelevant.
      const localRequire = createRequire(join(process.cwd(), '__dsh_pty_anchor__.cjs'))
      return localRequire(candidate) as PtyModule
    }
  }
  return undefined
}
