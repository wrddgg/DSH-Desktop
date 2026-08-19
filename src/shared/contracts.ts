export const DESKTOP_VERSION = '1.0.0'
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
}
