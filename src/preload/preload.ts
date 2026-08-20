import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  BootStateSnapshot,
  DesktopInfo,
  DshDesktopApi,
  RuntimeState,
  UpdateState,
} from '../shared/contracts.js'

const api: DshDesktopApi = {
  getInfo: () => ipcRenderer.invoke('desktop:get-info') as Promise<DesktopInfo>,
  getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state') as Promise<UpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates') as Promise<UpdateState>,
  downloadUpdate: () => ipcRenderer.invoke('desktop:download-update') as Promise<UpdateState>,
  downloadAndInstall: () => ipcRenderer.invoke('desktop:download-and-install') as Promise<UpdateState>,
  restartAndInstall: () => ipcRenderer.invoke('desktop:restart-and-install') as Promise<void>,
  openReleases: () => ipcRenderer.invoke('desktop:open-releases') as Promise<void>,
  openLogs: () => ipcRenderer.invoke('desktop:open-logs') as Promise<void>,
  restartHarness: () => ipcRenderer.invoke('desktop:restart-harness') as Promise<void>,
  getRuntimeState: () => ipcRenderer.invoke('desktop:get-runtime-state') as Promise<RuntimeState>,
  onUpdateState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on('desktop:update-state', handler)
    return () => ipcRenderer.removeListener('desktop:update-state', handler)
  },
  onRuntimeState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: RuntimeState): void => listener(state)
    ipcRenderer.on('desktop:runtime-state', handler)
    return () => ipcRenderer.removeListener('desktop:runtime-state', handler)
  },
  getBootState: () => ipcRenderer.invoke('desktop:get-boot-state') as Promise<BootStateSnapshot>,
  onBootState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BootStateSnapshot): void => listener(state)
    ipcRenderer.on('desktop:boot-state', handler)
    return () => ipcRenderer.removeListener('desktop:boot-state', handler)
  },
  startSafeMode: () => ipcRenderer.invoke('desktop:start-safe-mode') as Promise<void>,
  startWithPluginsDisabled: () => ipcRenderer.invoke('desktop:start-with-plugins-disabled') as Promise<void>,
  recoverLastGood: () => ipcRenderer.invoke('desktop:recover-last-good') as Promise<void>,
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  fs: {
    stat: (path) => ipcRenderer.invoke('desktop:fs:stat', path),
    list: (directory) => ipcRenderer.invoke('desktop:fs:list', directory),
    read: (path, options) => ipcRenderer.invoke('desktop:fs:read', path, options ?? {}),
    write: (path, content) => ipcRenderer.invoke('desktop:fs:write', path, content),
    search: (query, options) => ipcRenderer.invoke('desktop:fs:search', query, options ?? {}),
  },
  dialog: {
    pickFiles: () => ipcRenderer.invoke('desktop:dialog:pick-files'),
    pickDirectory: (options) => ipcRenderer.invoke('desktop:dialog:pick-directory', options ?? {}),
  },
  secret: {
    get: (key) => ipcRenderer.invoke('desktop:secret:get', key),
    set: (key, value) => ipcRenderer.invoke('desktop:secret:set', key, value),
    delete: (key) => ipcRenderer.invoke('desktop:secret:delete', key),
  },
  git: {
    isRepo: (cwd) => ipcRenderer.invoke('desktop:git:is-repo', cwd),
    status: (cwd) => ipcRenderer.invoke('desktop:git:status', cwd),
    diff: (cwd, options) => ipcRenderer.invoke('desktop:git:diff', cwd, options ?? {}),
    stage: (cwd, paths) => ipcRenderer.invoke('desktop:git:stage', cwd, paths),
    unstage: (cwd, paths) => ipcRenderer.invoke('desktop:git:unstage', cwd, paths),
    commit: (cwd, message) => ipcRenderer.invoke('desktop:git:commit', cwd, message),
  },
  pty: {
    available: () => ipcRenderer.invoke('desktop:pty:available') as Promise<boolean>,
    list: () => ipcRenderer.invoke('desktop:pty:list'),
    create: (options) => ipcRenderer.invoke('desktop:pty:create', options ?? {}),
    write: (id, data) => ipcRenderer.invoke('desktop:pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('desktop:pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('desktop:pty:kill', id),
    onData: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, data: string): void => listener(id, data)
      ipcRenderer.on('desktop:pty:data', handler)
      return () => ipcRenderer.removeListener('desktop:pty:data', handler)
    },
    onExit: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number): void => listener(id, exitCode)
      ipcRenderer.on('desktop:pty:exit', handler)
      return () => ipcRenderer.removeListener('desktop:pty:exit', handler)
    },
  },
}

contextBridge.exposeInMainWorld('dshDesktop', Object.freeze(api))
