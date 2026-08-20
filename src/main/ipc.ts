import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DSH_VERSION,
  RELEASES_URL,
  type DesktopInfo,
} from '../shared/contracts.js'
import { AppUpdater } from './app-updater.js'
import { BootStateStore } from './boot-state.js'
import { DialogBridge } from './bridge-dialog.js'
import { FsBridge } from './bridge-fs.js'
import { GitBridge } from './bridge-git.js'
import { PtyBridge } from './bridge-pty.js'
import { SecretStore } from './bridge-secret.js'
import { HarnessSupervisor } from './harness-supervisor.js'
import { AppLogger } from './logger.js'
import { isAllowedHarnessUrl } from './readiness.js'

function inside(candidate: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(`:${sep}`))
}

function trustedSender(event: IpcMainInvokeEvent, supervisor: HarnessSupervisor): boolean {
  const senderUrl = event.senderFrame?.url
  if (senderUrl === undefined) return false
  if (isAllowedHarnessUrl(senderUrl, supervisor.readyUrl)) return true
  try {
    const url = new URL(senderUrl)
    if (url.protocol !== 'file:') return false
    return inside(fileURLToPath(url), resolve(app.getAppPath(), 'dist', 'renderer'))
  } catch {
    return false
  }
}

export function registerIpc(options: {
  updater: AppUpdater
  supervisor: HarnessSupervisor
  logger: AppLogger
  bootStore: BootStateStore
  fsBridge: FsBridge
  dialogBridge: DialogBridge
  secretStore: SecretStore
  gitBridge: GitBridge
  ptyBridge: PtyBridge
  send: (channel: string, ...args: unknown[]) => void
}): void {
  const { updater, supervisor, logger, bootStore, fsBridge, dialogBridge, secretStore, gitBridge, ptyBridge, send } = options
  const handle = <T>(channel: string, action: (...args: unknown[]) => T | Promise<T>): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trustedSender(event, supervisor)) throw new Error('Blocked untrusted Desktop IPC sender')
      return action(...args)
    })
  }
  const stringArg = (value: unknown, field = 'path'): string => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 32_768) {
      throw new Error(`Invalid ${field} argument`)
    }
    return value
  }

  handle('desktop:get-info', (): DesktopInfo => ({
    desktopVersion: app.getVersion(),
    dshVersion: DSH_VERSION,
    updateChannel: 'stable',
    packaged: app.isPackaged,
    releasesUrl: RELEASES_URL,
  }))
  handle('desktop:get-update-state', () => updater.state)
  handle('desktop:check-for-updates', () => updater.check())
  handle('desktop:download-update', () => updater.download())
  handle('desktop:download-and-install', async () => {
    await logger.write('updater', 'Downloading update and preparing a silent restart')
    return updater.downloadAndInstall(async () => {
      await logger.write('updater', 'Stopping Harness before installing the downloaded update')
      await supervisor.stop()
    })
  })
  handle('desktop:restart-and-install', async () => {
    if (updater.state.status !== 'downloaded') return
    await logger.write('updater', 'Stopping Harness before installing the downloaded update')
    await supervisor.stop()
    updater.quitAndInstall()
  })
  handle('desktop:get-runtime-state', () => supervisor.state)
  handle('desktop:restart-harness', () => supervisor.restart())
  handle('desktop:open-releases', () => shell.openExternal(RELEASES_URL))
  handle('desktop:open-logs', async () => {
    await logger.write('desktop', 'Opening log folder')
    shell.showItemInFolder(logger.file)
  })

  // ---- Workbench bridges -------------------------------------------------

  handle('desktop:fs:stat', (path: unknown) => fsBridge.statPath(stringArg(path)))
  handle('desktop:fs:list', (directory: unknown) => fsBridge.list(stringArg(directory, 'directory')))
  handle('desktop:fs:read', (path: unknown, options: unknown) => {
    const raw = options !== null && typeof options === 'object' ? options as { maxBytes?: unknown } : {}
    const maxBytes = raw.maxBytes !== undefined ? Number(raw.maxBytes) : undefined
    const readOptions: { maxBytes?: number } | undefined = typeof maxBytes === 'number' && Number.isFinite(maxBytes)
      ? { maxBytes }
      : undefined
    return fsBridge.read(stringArg(path), readOptions)
  })
  handle('desktop:fs:write', (path: unknown, content: unknown) => {
    if (typeof content !== 'string' || content.length > 64 * 1024 * 1024) throw new Error('Invalid content argument')
    return fsBridge.write(stringArg(path), content)
  })
  handle('desktop:fs:search', (query: unknown, options: unknown) => {
    const raw = options !== null && typeof options === 'object' ? options as { root?: unknown; limit?: unknown } : {}
    const searchOptions: { root?: string; limit?: number } = {}
    if (typeof raw.root === 'string' && raw.root.length > 0) searchOptions.root = raw.root
    if (typeof raw.limit === 'number' && Number.isFinite(raw.limit)) searchOptions.limit = raw.limit
    return fsBridge.search(stringArg(query, 'query'), searchOptions)
  })

  handle('desktop:dialog:pick-files', () => dialogBridge.pickFiles())
  handle('desktop:dialog:pick-directory', (options: unknown) => {
    const defaultPath = options !== null && typeof options === 'object' && 'defaultPath' in options
      ? (options as { defaultPath?: unknown }).defaultPath
      : undefined
    return dialogBridge.pickDirectory(typeof defaultPath === 'string' && defaultPath.length > 0 ? { defaultPath } : undefined)
  })

  handle('desktop:secret:get', (key: unknown) => secretStore.get(stringArg(key, 'key')))
  handle('desktop:secret:set', (key: unknown, value: unknown) => {
    if (typeof value !== 'string' || value.length > 16_384) throw new Error('Invalid secret value')
    return secretStore.set(stringArg(key, 'key'), value)
  })
  handle('desktop:secret:delete', (key: unknown) => secretStore.delete(stringArg(key, 'key')))

  handle('desktop:git:is-repo', (cwd: unknown) => gitBridge.isRepo(stringArg(cwd, 'cwd')))
  handle('desktop:git:status', (cwd: unknown) => gitBridge.status(stringArg(cwd, 'cwd')))
  handle('desktop:git:diff', (cwd: unknown, options: unknown) => {
    const path = options !== null && typeof options === 'object' && 'path' in options
      ? (options as { path?: unknown }).path
      : undefined
    const staged = options !== null && typeof options === 'object' && 'staged' in options
      ? (options as { staged?: unknown }).staged
      : undefined
    return gitBridge.diff(stringArg(cwd, 'cwd'), {
      ...(typeof path === 'string' && path.length > 0 ? { path } : {}),
      ...(staged === true ? { staged: true } : {}),
    })
  })
  handle('desktop:git:stage', (cwd: unknown, paths: unknown) => {
    if (!Array.isArray(paths) || paths.some(entry => typeof entry !== 'string')) throw new Error('Invalid paths argument')
    return gitBridge.stage(stringArg(cwd, 'cwd'), paths as string[])
  })
  handle('desktop:git:unstage', (cwd: unknown, paths: unknown) => {
    if (!Array.isArray(paths) || paths.some(entry => typeof entry !== 'string')) throw new Error('Invalid paths argument')
    return gitBridge.unstage(stringArg(cwd, 'cwd'), paths as string[])
  })
  handle('desktop:git:commit', (cwd: unknown, message: unknown) => gitBridge.commit(stringArg(cwd, 'cwd'), stringArg(message, 'message')))

  // ---- Recovery / Safe Mode ---------------------------------------------

  handle('desktop:get-boot-state', () => bootStore.snapshot())
  handle('desktop:start-safe-mode', () => supervisor.restartSafe())
  handle('desktop:start-with-plugins-disabled', () => {
    const snapshot = bootStore.snapshot()
    return supervisor.restartWithPluginsDisabled(snapshot.suspectedPlugin)
  })
  handle('desktop:recover-last-good', () => supervisor.recoverLastGood())

  // ---- Terminal bridge --------------------------------------------------

  handle('desktop:pty:available', () => ptyBridge.available)
  handle('desktop:pty:list', () => ({ ok: true, sessions: ptyBridge.list() }))
  handle('desktop:pty:create', (options: unknown) => {
    const raw = options !== null && typeof options === 'object' ? options as {
      cwd?: unknown
      cols?: unknown
      rows?: unknown
      shell?: unknown
    } : {}
    const createOptions: { cwd?: string; cols?: number; rows?: number; shell?: string } = {}
    if (typeof raw.cwd === 'string' && raw.cwd.length > 0) createOptions.cwd = raw.cwd
    if (typeof raw.cols === 'number' && Number.isFinite(raw.cols)) createOptions.cols = raw.cols
    if (typeof raw.rows === 'number' && Number.isFinite(raw.rows)) createOptions.rows = raw.rows
    if (typeof raw.shell === 'string' && raw.shell.length > 0) createOptions.shell = raw.shell
    return ptyBridge.create(createOptions)
  })
  handle('desktop:pty:write', (id: unknown, data: unknown) => {
    if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('Invalid terminal input')
    return ptyBridge.write(stringArg(id, 'id'), data)
  })
  handle('desktop:pty:resize', (id: unknown, cols: unknown, rows: unknown) => {
    if (typeof cols !== 'number' || typeof rows !== 'number') throw new Error('Invalid terminal size')
    return ptyBridge.resize(stringArg(id, 'id'), cols, rows)
  })
  handle('desktop:pty:kill', (id: unknown) => ptyBridge.kill(stringArg(id, 'id')))

  ptyBridge.on('data', (id: string, data: string) => send('desktop:pty:data', id, data))
  ptyBridge.on('exit', (id: string, exitCode: number) => send('desktop:pty:exit', id, exitCode))
}
