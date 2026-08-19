import { contextBridge, ipcRenderer } from 'electron'
import type {
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
}

contextBridge.exposeInMainWorld('dshDesktop', Object.freeze(api))
