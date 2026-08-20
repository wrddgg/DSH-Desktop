import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface BootRecord {
  startedAt: number
  outcome: 'ok' | 'crashed'
  exitCode?: number
  mode: 'normal' | 'safe'
  suspectedPlugin?: string
}

export interface BootState {
  version: 1
  /** Recent boot outcomes, newest last, capped. */
  boots: BootRecord[]
  /** Unix ms of the last healthy boot (started + stayed alive). */
  lastGoodAt?: number
  /** Plugins the user asked to keep disabled (recovered from a crash loop). */
  disabledPlugins: string[]
}

export interface BootStateSnapshot {
  crashLoop: boolean
  suspectedPlugin?: string
  lastGoodAt?: number
  disabledPlugins: readonly string[]
}

const MAX_BOOTS = 20
const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000
const CRASH_LOOP_MIN_CRASHES = 3

/**
 * Crash-loop detection and Last Known Good bookkeeping for the runtime
 * supervisor. Pure state + JSON persistence; no Electron imports so the
 * logic stays unit-testable.
 */
export class BootStateStore {
  readonly #file: string
  #state: BootState
  #pendingWrite: Promise<void> = Promise.resolve()

  public constructor(file: string) {
    this.#file = file
    this.#state = { version: 1, boots: [], disabledPlugins: [] }
  }

  public get file(): string {
    return this.#file
  }

  /** Await any in-flight persistence (tests, orderly shutdowns). */
  public async flush(): Promise<void> {
    await this.#pendingWrite
  }

  public get state(): BootState {
    return this.#state
  }

  public async load(): Promise<void> {
    try {
      const raw = await readFile(this.#file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<BootState>
      if (parsed?.version === 1 && Array.isArray(parsed.boots)) {
        this.#state = {
          version: 1,
          boots: (parsed.boots as BootRecord[]).slice(-MAX_BOOTS),
          ...(typeof parsed.lastGoodAt === 'number' ? { lastGoodAt: parsed.lastGoodAt } : {}),
          disabledPlugins: Array.isArray(parsed.disabledPlugins) ? parsed.disabledPlugins : [],
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  public recordStart(mode: 'normal' | 'safe'): BootRecord {
    const record: BootRecord = { startedAt: Date.now(), outcome: 'ok', mode }
    this.#state.boots = [...this.#state.boots, record].slice(-MAX_BOOTS)
    void this.#persist()
    return record
  }

  public recordCrash(record: BootRecord, exitCode: number | null, suspectedPlugin?: string): void {
    record.outcome = 'crashed'
    if (exitCode !== null) record.exitCode = exitCode
    if (suspectedPlugin !== undefined) record.suspectedPlugin = suspectedPlugin
    void this.#persist()
  }

  public markLastGood(): void {
    this.#state.lastGoodAt = Date.now()
    void this.#persist()
  }

  public setDisabledPlugins(plugins: readonly string[]): void {
    this.#state.disabledPlugins = [...plugins]
    void this.#persist()
  }

  public addDisabledPlugin(name: string): void {
    if (this.#state.disabledPlugins.includes(name)) return
    this.#state.disabledPlugins = [...this.#state.disabledPlugins, name]
    void this.#persist()
  }

  public clearDisabledPlugins(): void {
    this.#state.disabledPlugins = []
    void this.#persist()
  }

  public snapshot(now = Date.now()): BootStateSnapshot {
    const windowStart = now - CRASH_LOOP_WINDOW_MS
    const recent = this.#state.boots.filter(record => record.startedAt >= windowStart)
    const crashes = recent.filter(record => record.outcome === 'crashed' && record.mode === 'normal')
    const suspected = [...crashes].reverse().find(record => record.suspectedPlugin !== undefined)?.suspectedPlugin
    const crashLoop = crashes.length >= CRASH_LOOP_MIN_CRASHES && this.#state.lastGoodAt === undefined
      ? true
      : crashes.length >= CRASH_LOOP_MIN_CRASHES && this.#state.lastGoodAt !== undefined && this.#state.lastGoodAt < crashes[crashes.length - 1]!.startedAt
    return {
      crashLoop,
      ...(suspected !== undefined ? { suspectedPlugin: suspected } : {}),
      ...(this.#state.lastGoodAt !== undefined ? { lastGoodAt: this.#state.lastGoodAt } : {}),
      disabledPlugins: [...this.#state.disabledPlugins],
    }
  }

  async #persist(): Promise<void> {
    this.#pendingWrite = this.#pendingWrite.then(async () => {
      await mkdir(dirname(this.#file), { recursive: true })
      await writeFile(this.#file, JSON.stringify(this.#state, null, 2), 'utf8')
    })
    await this.#pendingWrite
  }
}
