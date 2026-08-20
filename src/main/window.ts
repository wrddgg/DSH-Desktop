import { BrowserWindow, Menu, app, shell, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BootStateSnapshot, RuntimeState, UpdateState } from '../shared/contracts.js'
import { HarnessSupervisor } from './harness-supervisor.js'
import { isAllowedHarnessUrl } from './readiness.js'

export class DesktopWindow {
  readonly #supervisor: HarnessSupervisor
  #window: BrowserWindow | undefined

  public constructor(supervisor: HarnessSupervisor) {
    this.#supervisor = supervisor
  }

  public get browserWindow(): BrowserWindow | undefined {
    return this.#window
  }

  public async create(): Promise<BrowserWindow> {
    if (this.#window !== undefined && !this.#window.isDestroyed()) return this.#window

    Menu.setApplicationMenu(null)
    const window = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 920,
      minHeight: 640,
      show: false,
      title: 'DSH Desktop',
      backgroundColor: '#F9FAFB',
      icon: join(app.getAppPath(), 'build', 'icon.svg'),
      webPreferences: {
        preload: join(app.getAppPath(), 'dist', 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
      },
    })

    this.#window = window
    window.once('ready-to-show', () => window.show())
    window.on('closed', () => {
      this.#window = undefined
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      const splash = pathToFileURL(join(app.getAppPath(), 'dist', 'renderer', 'index.html')).href
      if (url === splash || isAllowedHarnessUrl(url, this.#supervisor.readyUrl)) return
      event.preventDefault()
      if (url.startsWith('https://')) void shell.openExternal(url)
    })

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      // The DSH page's copy buttons use navigator.clipboard.writeText; without
      // this grant Electron rejects the write and copy silently fails.
      callback(permission === 'clipboard-sanitized-write')
    })

    await window.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html'))
    return window
  }

  public async showHarness(url: string): Promise<void> {
    const window = await this.create()
    if (!isAllowedHarnessUrl(url, this.#supervisor.readyUrl)) {
      throw new Error(`Refusing to load unexpected Harness URL: ${url}`)
    }
    await window.loadURL(url)
    const bridgeReady = await window.webContents.executeJavaScript(
      "typeof globalThis.dshDesktop?.getInfo === 'function'",
      true,
    ) as boolean
    if (!bridgeReady) throw new Error('Desktop preload bridge was not exposed to the DSH page')
  }

  public sendRuntimeState(state: RuntimeState): void {
    this.send('desktop:runtime-state', state)
  }

  public sendUpdateState(state: UpdateState): void {
    this.send('desktop:update-state', state)
  }

  public sendBootState(state: BootStateSnapshot): void {
    this.send('desktop:boot-state', state)
  }

  public send(channel: string, ...args: unknown[]): void {
    if (this.#window !== undefined && !this.#window.isDestroyed()) {
      this.#window.webContents.send(channel, ...args)
    }
  }

  public focus(): void {
    const window = this.#window
    if (window === undefined || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
}
