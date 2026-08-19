import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppLogger } from '../src/main/logger.js'

const mocks = vi.hoisted(() => {
  class Emitter {
    readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    once(event: string, listener: (...args: unknown[]) => void): this {
      const wrapped = (...args: unknown[]): void => {
        this.listeners.set(event, (this.listeners.get(event) ?? []).filter(item => item !== wrapped))
        listener(...args)
      }
      return this.on(event, wrapped)
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
    }

    removeAllListeners(): void {
      this.listeners.clear()
    }
  }

  class FakeNotification extends Emitter {
    static instances: FakeNotification[] = []
    static supported = true
    readonly options: { title: string; body: string }
    shown = false
    closed = false

    static isSupported(): boolean {
      return FakeNotification.supported
    }

    constructor(options: { title: string; body: string }) {
      super()
      this.options = options
      FakeNotification.instances.push(this)
    }

    show(): void {
      this.shown = true
    }

    close(): void {
      this.closed = true
      this.emit('close')
    }
  }

  const autoUpdater = Object.assign(new Emitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined as unknown,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
  })

  return {
    app: { isPackaged: true, getVersion: () => '0.1.3', getPath: () => 'C:\\Temp' },
    autoUpdater,
    FakeNotification,
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  Notification: mocks.FakeNotification,
}))

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }))

import { AppUpdater } from '../src/main/app-updater.js'

function logger(): AppLogger {
  return { write: vi.fn(async () => undefined) } as unknown as AppLogger
}

beforeEach(() => {
  mocks.autoUpdater.removeAllListeners()
  mocks.autoUpdater.checkForUpdates.mockClear()
  mocks.autoUpdater.downloadUpdate.mockClear()
  mocks.autoUpdater.quitAndInstall.mockClear()
  mocks.FakeNotification.instances = []
  mocks.FakeNotification.supported = true
})

describe('AppUpdater automatic discovery', () => {
  it('checks after startup and again on the periodic interval', async () => {
    vi.useFakeTimers()
    const updater = new AppUpdater(logger())

    updater.startAutomaticChecks()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1_000)
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)

    updater.stopAutomaticChecks()
    vi.useRealTimers()
  })

  it('notifies once per available version and focuses on notification click', () => {
    const updater = new AppUpdater(logger())
    const clicked = vi.fn()
    updater.on('notification-clicked', clicked)

    const info = { version: '0.2.0', releaseName: null, releaseNotes: null }
    mocks.autoUpdater.emit('update-available', info)
    mocks.autoUpdater.emit('update-available', info)

    expect(updater.state.status).toBe('available')
    expect(mocks.FakeNotification.instances).toHaveLength(1)
    const notification = mocks.FakeNotification.instances[0]
    if (notification === undefined) throw new Error('Expected an update notification')
    expect(notification.shown).toBe(true)
    expect(notification.options.body).toContain('0.2.0')

    notification.emit('click')
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('uses the silent installer after the user starts download-and-install', async () => {
    const updater = new AppUpdater(logger())
    const info = { version: '0.2.0', releaseName: null, releaseNotes: null }
    mocks.autoUpdater.emit('update-available', info)
    mocks.autoUpdater.downloadUpdate.mockImplementation(async () => {
      mocks.autoUpdater.emit('update-downloaded', info)
    })

    const stopHarness = vi.fn(async () => undefined)
    const state = await updater.downloadAndInstall(stopHarness)

    expect(stopHarness).toHaveBeenCalledOnce()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(state.status).toBe('restarting')
    expect(state.percent).toBe(100)
  })

  it('marks failed pre-install cleanup as an updater error instead of closing the app', async () => {
    const updater = new AppUpdater(logger())
    const info = { version: '0.2.1', releaseName: null, releaseNotes: null }
    mocks.autoUpdater.emit('update-downloaded', info)

    const state = await updater.downloadAndInstall(async () => {
      throw new Error('Harness is still busy')
    })

    expect(state.status).toBe('error')
    expect(state.message).toBe('Harness is still busy')
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
