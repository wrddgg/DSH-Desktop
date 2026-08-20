export const DESKTOP_VERSION = '1.5.0'
export const DSH_VERSION = '0.1.0-rc.7'
export const RELEASES_URL = 'https://github.com/wrddgg/DSH-Desktop/releases'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'restarting'
  | 'downloaded'
  | 'installed'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion?: string
  releaseName?: string
  releaseNotes?: string
  percent?: number
  transferred?: number
  total?: number
  message?: string
  lastCheckedAt?: string
}

export type RuntimeStatus = 'starting' | 'ready' | 'stopping' | 'stopped' | 'error'

export interface RuntimeState {
  status: RuntimeStatus
  message: string
  url?: string
  logTail: readonly string[]
}

export interface DesktopInfo {
  desktopVersion: string
  dshVersion: string
  updateChannel: 'stable'
  packaged: boolean
  releasesUrl: string
}

export interface BootStateSnapshot {
  crashLoop: boolean
  suspectedPlugin?: string
  lastGoodAt?: number
  disabledPlugins: readonly string[]
}

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

export interface DshDesktopApi {
  getInfo(): Promise<DesktopInfo>
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  downloadAndInstall(): Promise<UpdateState>
  restartAndInstall(): Promise<void>
  openReleases(): Promise<void>
  openLogs(): Promise<void>
  restartHarness(): Promise<void>
  getRuntimeState(): Promise<RuntimeState>
  onUpdateState(listener: (state: UpdateState) => void): () => void
  onRuntimeState(listener: (state: RuntimeState) => void): () => void
  /** Crash-loop / Last Known Good state for the launch screen. */
  getBootState(): Promise<BootStateSnapshot>
  onBootState(listener: (state: BootStateSnapshot) => void): () => void
  startSafeMode(): Promise<void>
  startWithPluginsDisabled(): Promise<void>
  recoverLastGood(): Promise<void>
  /** Resolve the absolute filesystem path behind a dropped browser File. */
  getPathForFile(file: File): string
  fs: DshDesktopFsApi
  dialog: DshDesktopDialogApi
  secret: DshDesktopSecretApi
  git: DshDesktopGitApi
  pty: DshDesktopPtyApi
}

export interface DshDesktopPtyApi {
  available(): Promise<boolean>
  list(): Promise<{ ok: boolean; sessions?: PtySessionSummary[] }>
  create(options?: { cwd?: string; cols?: number; rows?: number; shell?: string }): Promise<PtyCreateResult>
  write(id: string, data: string): Promise<{ ok: boolean; message?: string }>
  resize(id: string, cols: number, rows: number): Promise<{ ok: boolean; message?: string }>
  kill(id: string): Promise<{ ok: boolean; message?: string }>
  onData(listener: (id: string, data: string) => void): () => void
  onExit(listener: (id: string, exitCode: number) => void): () => void
}

export interface FsEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
}

export interface FsStatResult {
  ok: boolean
  exists?: boolean
  isDirectory?: boolean
  size?: number
  message?: string
}

export interface FsListResult {
  ok: boolean
  entries?: FsEntry[]
  message?: string
}

export interface FsReadResult {
  ok: boolean
  content?: string
  binary?: boolean
  truncated?: boolean
  message?: string
}

export interface FsSearchEntry {
  path: string
  isDirectory: boolean
  size: number
}

export interface FsSearchResult {
  ok: boolean
  entries?: FsSearchEntry[]
  message?: string
}

export interface DshDesktopFsApi {
  stat(path: string): Promise<FsStatResult>
  list(directory: string): Promise<FsListResult>
  read(path: string, options?: { maxBytes?: number }): Promise<FsReadResult>
  write(path: string, content: string): Promise<{ ok: boolean; message?: string }>
  search(query: string, options?: { root?: string; limit?: number }): Promise<FsSearchResult>
}

export interface DialogPickFilesResult {
  ok: boolean
  paths?: string[]
  canceled?: boolean
}

export interface DialogPickDirectoryResult {
  ok: boolean
  path?: string
  canceled?: boolean
}

export interface DshDesktopDialogApi {
  pickFiles(): Promise<DialogPickFilesResult>
  pickDirectory(options?: { defaultPath?: string }): Promise<DialogPickDirectoryResult>
}

export interface SecretResult {
  ok: boolean
  value?: string
  message?: string
}

export interface DshDesktopSecretApi {
  get(key: string): Promise<SecretResult>
  set(key: string, value: string): Promise<SecretResult>
  delete(key: string): Promise<SecretResult>
}

export interface GitRunResult {
  ok: boolean
  stdout?: string
  stderr?: string
  code?: number
  message?: string
}

export interface GitStatusEntry {
  path: string
  status: string
  staged: boolean
}

export interface GitStatusResult {
  ok: boolean
  branch?: string
  entries?: GitStatusEntry[]
  message?: string
}

export interface DshDesktopGitApi {
  isRepo(cwd: string): Promise<{ ok: boolean; isRepo?: boolean; message?: string }>
  status(cwd: string): Promise<GitStatusResult>
  diff(cwd: string, options?: { path?: string; staged?: boolean }): Promise<{ ok: boolean; text?: string; message?: string }>
  stage(cwd: string, paths: string[]): Promise<GitRunResult>
  unstage(cwd: string, paths: string[]): Promise<GitRunResult>
  commit(cwd: string, message: string): Promise<GitRunResult>
}
