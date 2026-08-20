/**
 * Minimal structural declarations for the Electron-safe pwsh executor.
 * Kept dependency-light so the desktop's main tsconfig can typecheck the
 * plugin without resolving the official runtime packages.
 */

export interface DesktopPwshRunResult {
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  aborted: boolean
  timeoutMs: number
  stdout: { text: string; truncated?: boolean; spillPath?: string }
  stderr: { text: string; truncated?: boolean; spillPath?: string }
  sandbox?: { mode: string; denied: boolean; enforcement?: string }
}

export interface DesktopPwshConfig {
  cwd: string
  timeoutMs: number
  maxTimeoutMs: number
  maxOutputBytes: number
  maxSpillBytes: number
  graceMs: number
  pwshPath: string
}

export declare class DesktopPwshExecutor {
  constructor(ctx: unknown, config: DesktopPwshConfig)
  readonly sandboxMode: string | undefined
  resolve(request: unknown): unknown
  run(spec: unknown): Promise<DesktopPwshRunResult>
  start(spec: unknown): unknown
}

export default DesktopPwshExecutor
