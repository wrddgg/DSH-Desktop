import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DSH_VERSION,
  RELEASES_URL,
  type DesktopInfo,
} from '../shared/contracts.js'
import { AppUpdater } from './app-updater.js'
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
}): void {
  const { updater, supervisor, logger } = options
  const handle = <T>(channel: string, action: () => T | Promise<T>): void => {
    ipcMain.handle(channel, async (event) => {
      if (!trustedSender(event, supervisor)) throw new Error('Blocked untrusted Desktop IPC sender')
      return action()
    })
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
}
