import { EventEmitter } from 'node:events'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, Notification } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/contracts.js'
import { AppLogger } from './logger.js'

const STARTUP_CHECK_DELAY_MS = 10_000
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000

function releaseNotes(info: UpdateInfo): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes.map(note => `${note.version}: ${note.note ?? ''}`).join('\n')
  }
  return undefined
}

type ReleaseFields = Pick<UpdateState, 'availableVersion' | 'releaseName' | 'releaseNotes'>

function fieldsFromInfo(info: UpdateInfo): ReleaseFields {
  const fields: ReleaseFields = { availableVersion: info.version }
  if (info.releaseName !== null && info.releaseName !== undefined) fields.releaseName = info.releaseName
  const notes = releaseNotes(info)
  if (notes !== undefined) fields.releaseNotes = notes
  return fields
}

function fieldsFromState(state: UpdateState): ReleaseFields {
  const fields: ReleaseFields = {}
  if (state.availableVersion !== undefined) fields.availableVersion = state.availableVersion
  if (state.releaseName !== undefined) fields.releaseName = state.releaseName
  if (state.releaseNotes !== undefined) fields.releaseNotes = state.releaseNotes
  return fields
}

export class AppUpdater extends EventEmitter {
  readonly #logger: AppLogger
  #state: UpdateState
  #checkInFlight: Promise<UpdateState> | undefined
  #startupCheckTimer: NodeJS.Timeout | undefined
  #periodicCheckTimer: NodeJS.Timeout | undefined
  #notification: Notification | undefined
  #notifiedVersion: string | undefined
  #installInFlight: Promise<UpdateState> | undefined
  #downloadWaiter: {
    resolve: (state: UpdateState) => void
    reject: (error: Error) => void
  } | undefined
  readonly #pendingInstallFile: string

  public constructor(logger: AppLogger) {
    super()
    this.#logger = logger
    this.#pendingInstallFile = join(app.getPath('userData'), 'pending-update.json')
    this.#state = {
      status: 'idle',
      currentVersion: app.getVersion(),
      message: app.isPackaged ? '可以检查新版本' : '开发模式不会连接更新源',
    }
    this.#recoverCompletedInstall()

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (...args: unknown[]) => void this.#logger.write('updater', args.map(String).join(' ')),
      warn: (...args: unknown[]) => void this.#logger.write('updater:warn', args.map(String).join(' ')),
      error: (...args: unknown[]) => void this.#logger.write('updater:error', args.map(String).join(' ')),
      debug: (...args: unknown[]) => void this.#logger.write('updater:debug', args.map(String).join(' ')),
    }

    autoUpdater.on('checking-for-update', () => {
      this.#set({ status: 'checking', message: '正在检查更新…' })
    })
    autoUpdater.on('update-not-available', () => {
      this.#set({
        status: 'current',
        message: '当前已是最新版',
        lastCheckedAt: new Date().toISOString(),
      })
    })
    autoUpdater.on('update-available', (info) => {
      this.#set({
        status: 'available',
        ...fieldsFromInfo(info),
        message: `DSH Desktop ${info.version} 已可用`,
        lastCheckedAt: new Date().toISOString(),
      })
      this.#notifyAvailable(info)
    })
    autoUpdater.on('download-progress', (progress) => this.#onProgress(progress))
    autoUpdater.on('update-downloaded', (info) => {
      this.#set({
        status: 'downloaded',
        ...fieldsFromInfo(info),
        percent: 100,
        message: '下载完成，正在校验并准备自动重启…',
      })
      const waiter = this.#downloadWaiter
      this.#downloadWaiter = undefined
      waiter?.resolve(this.#state)
    })
    autoUpdater.on('error', (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.#set({ status: 'error', message: normalized.message })
      const waiter = this.#downloadWaiter
      this.#downloadWaiter = undefined
      waiter?.reject(normalized)
    })
  }

  public get state(): UpdateState {
    return this.#state
  }

  public startAutomaticChecks(): void {
    if (
      !app.isPackaged
      || this.#startupCheckTimer !== undefined
      || this.#periodicCheckTimer !== undefined
    ) return

    this.#startupCheckTimer = setTimeout(() => {
      this.#startupCheckTimer = undefined
      void this.check()
    }, STARTUP_CHECK_DELAY_MS)
    this.#startupCheckTimer.unref()

    this.#periodicCheckTimer = setInterval(() => {
      void this.check()
    }, PERIODIC_CHECK_INTERVAL_MS)
    this.#periodicCheckTimer.unref()
  }

  public stopAutomaticChecks(): void {
    if (this.#startupCheckTimer !== undefined) clearTimeout(this.#startupCheckTimer)
    if (this.#periodicCheckTimer !== undefined) clearInterval(this.#periodicCheckTimer)
    this.#startupCheckTimer = undefined
    this.#periodicCheckTimer = undefined
    this.#notification?.close()
    this.#notification = undefined
  }

  public async check(): Promise<UpdateState> {
    if (!app.isPackaged) {
      this.#set({
        status: 'current',
        message: '这是开发构建；安装版会从 GitHub Releases 检查更新',
        lastCheckedAt: new Date().toISOString(),
      })
      return this.#state
    }

    if (this.#state.status === 'downloading' || this.#state.status === 'downloaded') {
      return this.#state
    }
    if (this.#checkInFlight !== undefined) return this.#checkInFlight

    const check = this.#performCheck()
    this.#checkInFlight = check
    try {
      return await check
    } finally {
      if (this.#checkInFlight === check) this.#checkInFlight = undefined
    }
  }

  async #performCheck(): Promise<UpdateState> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.#set({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return this.#state
  }

  public async download(): Promise<UpdateState> {
    if (this.#state.status !== 'available') return this.#state
    this.#set({
      status: 'downloading',
      ...fieldsFromState(this.#state),
      percent: 0,
      message: '正在下载更新…',
    })
    try {
      const completed = this.#waitForDownload()
      await autoUpdater.downloadUpdate()
      // electron-updater normally resolves after `update-downloaded`, but
      // waiting for the event makes the one-click install path deterministic
      // across updater versions and prevents a second install button.
      await completed
    } catch (error) {
      this.#downloadWaiter = undefined
      this.#set({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return this.#state
  }

  #waitForDownload(): Promise<UpdateState> {
    if (this.#state.status === 'downloaded') return Promise.resolve(this.#state)
    return new Promise<UpdateState>((resolve, reject) => {
      this.#downloadWaiter = { resolve, reject }
    })
  }

  /** Download, verify and hand the update to the silent installer in one user action. */
  public async downloadAndInstall(beforeInstall: () => Promise<void>): Promise<UpdateState> {
    if (this.#installInFlight !== undefined) return this.#installInFlight

    const operation = (async (): Promise<UpdateState> => {
      try {
        const downloaded = this.#state.status === 'downloaded' ? this.#state : await this.download()
        if (downloaded.status !== 'downloaded') return downloaded

        this.#set({
          status: 'verifying',
          ...fieldsFromState(downloaded),
          percent: 100,
          message: '正在校验更新包…',
        })
        await beforeInstall()
        this.#writePendingInstall(downloaded.availableVersion)
        this.#set({
          status: 'restarting',
          ...fieldsFromState(downloaded),
          percent: 100,
          message: '正在重启并安装，应用会自动打开…',
        })
        this.quitAndInstall()
        return this.#state
      } catch (error) {
        this.#set({
          status: 'error',
          ...fieldsFromState(this.#state),
          message: error instanceof Error ? error.message : String(error),
        })
        return this.#state
      }
    })()

    this.#installInFlight = operation
    try {
      return await operation
    } finally {
      if (this.#installInFlight === operation) this.#installInFlight = undefined
    }
  }

  public quitAndInstall(): void {
    if (this.#state.status === 'downloaded' || this.#state.status === 'verifying' || this.#state.status === 'restarting') {
      autoUpdater.quitAndInstall(true, true)
    }
  }

  #notifyAvailable(info: UpdateInfo): void {
    if (this.#notifiedVersion === info.version || !Notification.isSupported()) return

    try {
      const notification = new Notification({
        title: 'DSH Desktop 更新可用',
        body: `版本 ${info.version} 已可用。请在应用右上角或“设置 → 更新”中下载。`,
      })
      this.#notification?.close()
      this.#notification = notification
      notification.once('click', () => this.emit('notification-clicked'))
      notification.once('close', () => {
        if (this.#notification === notification) this.#notification = undefined
      })
      notification.show()
      this.#notifiedVersion = info.version
    } catch (error) {
      void this.#logger.write(
        'updater:warn',
        `Could not show update notification: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  #onProgress(progress: ProgressInfo): void {
    this.#set({
      status: 'downloading',
      ...fieldsFromState(this.#state),
      percent: Math.max(0, Math.min(100, progress.percent)),
      transferred: progress.transferred,
      total: progress.total,
      message: `正在下载更新 ${Math.round(progress.percent)}%`,
    })
  }

  #writePendingInstall(version: string | undefined): void {
    if (version === undefined) return
    try {
      writeFileSync(this.#pendingInstallFile, JSON.stringify({ version, startedAt: new Date().toISOString() }), 'utf8')
    } catch (error) {
      void this.#logger.write(
        'updater:warn',
        `Could not persist pending update marker: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  #recoverCompletedInstall(): void {
    try {
      const marker = JSON.parse(readFileSync(this.#pendingInstallFile, 'utf8')) as { version?: unknown }
      if (marker.version !== app.getVersion()) return
      this.#state = {
        status: 'installed',
        currentVersion: app.getVersion(),
        availableVersion: app.getVersion(),
        message: `已更新到 DSH Desktop ${app.getVersion()}`,
      }
      unlinkSync(this.#pendingInstallFile)
    } catch {
      // A missing or incomplete marker is not an updater failure.
    }
  }

  #set(next: Omit<UpdateState, 'currentVersion'>): void {
    this.#state = { currentVersion: app.getVersion(), ...next }
    this.emit('state', this.#state)
  }
}
