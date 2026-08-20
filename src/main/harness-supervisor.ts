import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DESKTOP_VERSION, type RuntimeState } from '../shared/contracts.js'
import { AppLogger } from './logger.js'
import { ensureDesktopProfile, type PluginSources } from './profile.js'
import { parseHarnessUrl } from './readiness.js'

const START_TIMEOUT_MS = 90_000
const MAX_LOG_LINES = 80

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function terminateProcessTree(processId: number): Promise<void> {
  const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
  await new Promise<void>((resolve) => {
    const killer = spawn(taskkill, ['/pid', String(processId), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.once('error', () => resolve())
    killer.once('exit', () => resolve())
  })
}

function resolveDshBin(override: string | undefined): string {
  if (override !== undefined) return override
  const require = createRequire(__filename)
  return require.resolve('@deepseek-ai/dsh/lib/bin.js')
}

function cleanEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value
  }
  return { ...environment, ...overrides }
}

export class HarnessSupervisor extends EventEmitter {
  readonly #dshHome: string
  readonly #workspace: string
  readonly #pluginSources: PluginSources
  readonly #dshBin: string | undefined
  readonly #logger: AppLogger
  #child: ChildProcess | undefined
  #startupTimer: NodeJS.Timeout | undefined
  #probingUrl: string | undefined
  #streamBuffers = new Map<string, string>()
  #logTail: string[] = []
  #state: RuntimeState = {
    status: 'stopped',
    message: 'Harness 尚未启动',
    logTail: [],
  }

  public constructor(options: {
    dshHome: string
    workspace: string
    pluginSources: PluginSources
    dshBin: string | undefined
    logger: AppLogger
  }) {
    super()
    this.#dshHome = options.dshHome
    this.#workspace = options.workspace
    this.#pluginSources = options.pluginSources
    this.#dshBin = options.dshBin
    this.#logger = options.logger
  }

  public get state(): RuntimeState {
    return this.#state
  }

  public get readyUrl(): string | undefined {
    return this.#state.url
  }

  public async start(): Promise<void> {
    if (this.#child !== undefined) return

    this.#setState({ status: 'starting', message: '正在准备 Desktop 配置…' })
    try {
      await ensureDesktopProfile(this.#dshHome, this.#pluginSources)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.#logger.write('desktop:error', message)
      this.#setState({ status: 'error', message })
      return
    }
    await this.#logger.write('desktop', `Using DSH_HOME=${this.#dshHome}`)

    const dshBin = resolveDshBin(this.#dshBin)
    this.#setState({ status: 'starting', message: '正在启动 DeepSeek Harness…' })
    await this.#logger.write('desktop', `Starting ${dshBin}`)

    const child = spawn(
      process.execPath,
      ['--expose-internals', dshBin, '--profile', 'dsh-desktop-app', '--port', '0'],
      {
        cwd: this.#workspace,
        env: cleanEnvironment({
          ELECTRON_RUN_AS_NODE: '1',
          DSH_HOME: this.#dshHome,
          DSH_DESKTOP: '1',
          DSH_DESKTOP_VERSION: DESKTOP_VERSION,
          // The Windows ACL sandbox runner crashes PowerShell child processes
          // (0xC0000142) when DSH itself runs under Electron. The desktop
          // therefore runs the harness unconfined at the file-effect level;
          // safety comes from the product permission modes and approvals.
          DSH_PERMISSION_MODE: 'danger-full-access',
        }),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    this.#child = child
    this.#streamBuffers.clear()
    this.#probingUrl = undefined

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.#consume(chunk, 'dsh'))
    child.stderr?.on('data', (chunk: string) => this.#consume(chunk, 'dsh:error'))
    child.on('exit', (code) => {
      this.#clearStartupTimer()
      this.#flush('dsh')
      this.#flush('dsh:error')
      this.#child = undefined
      if (this.#state.status === 'stopping') {
        this.#setState({ status: 'stopped', message: 'Harness 已停止' })
        return
      }

      const message = `Harness 已退出（代码 ${code ?? 'unknown'}）`
      void this.#logger.write('desktop', message)
      this.#setState({ status: 'error', message })
    })

    this.#startupTimer = setTimeout(() => {
      if (this.#state.status !== 'ready') {
        const message = 'Harness 启动超时。请重试，或打开日志查看详细信息。'
        void this.#logger.write('desktop', message)
        this.#setState({ status: 'error', message })
        child.kill()
      }
    }, START_TIMEOUT_MS)
  }

  public async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  public async stop(): Promise<void> {
    const child = this.#child
    if (child === undefined) return

    this.#setState({ status: 'stopping', message: '正在安全停止 Harness…' })
    this.#clearStartupTimer()

    let exited = false
    const exit = new Promise<void>((resolve) => {
      child.once('exit', () => {
        exited = true
        resolve()
      })
    })

    child.kill()
    await Promise.race([exit, wait(2_500)])
    if (!exited && child.pid !== undefined) {
      await this.#logger.write('desktop', `Force-closing Harness process tree ${child.pid}`)
      await terminateProcessTree(child.pid)
      await Promise.race([exit, wait(2_500)])
    }

    if (this.#child === child) this.#child = undefined
  }

  #clearStartupTimer(): void {
    if (this.#startupTimer !== undefined) clearTimeout(this.#startupTimer)
    this.#startupTimer = undefined
  }

  #consume(chunk: string, scope: string): void {
    const buffered = (this.#streamBuffers.get(scope) ?? '') + chunk
    const lines = buffered.split(/\r?\n/)
    this.#streamBuffers.set(scope, lines.pop() ?? '')
    for (const line of lines) this.#consumeLine(line, scope)
  }

  #flush(scope: string): void {
    const line = this.#streamBuffers.get(scope)
    this.#streamBuffers.delete(scope)
    if (line !== undefined && line.length > 0) this.#consumeLine(line, scope)
  }

  #consumeLine(rawLine: string, scope: string): void {
    const line = rawLine.trimEnd()
    if (line.length === 0) return

    this.#logTail.push(line)
    if (this.#logTail.length > MAX_LOG_LINES) this.#logTail.shift()
    void this.#logger.write(scope, line)

    const url = parseHarnessUrl(line)
    if (url !== undefined && this.#probingUrl === undefined) {
      this.#probingUrl = url
      this.#setState({ status: 'starting', message: '正在连接本机 Harness…' })
      void this.#confirmReady(url)
      return
    }

    if (this.#state.status === 'starting') {
      this.#setState({ status: 'starting', message: '正在加载官方 DSH 插件…' })
    }
  }

  async #confirmReady(url: string): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (this.#child === undefined || this.#probingUrl !== url) return
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
        if (response.status < 500) {
          this.#clearStartupTimer()
          await this.#logger.write('desktop', `Harness accepted connections at ${url}`)
          this.#setState({ status: 'ready', message: 'Harness 已就绪', url })
          return
        }
      } catch {
        // The URL line may precede the listen socket by a few hundred ms.
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }

    if (this.#child !== undefined && this.#probingUrl === url) {
      const message = 'Harness 已报告地址，但本机服务没有开始接受连接。'
      await this.#logger.write('desktop:error', message)
      this.#setState({ status: 'error', message })
      this.#child.kill()
    }
  }

  #setState(next: Omit<RuntimeState, 'logTail'>): void {
    this.#state = { ...next, logTail: [...this.#logTail] }
    this.emit('state', this.#state)
  }
}
