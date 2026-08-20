import { app } from 'electron'
import { join } from 'node:path'
import type { RuntimeState, UpdateState } from '../shared/contracts.js'
import { AppUpdater } from './app-updater.js'
import { BootStateStore } from './boot-state.js'
import { DialogBridge } from './bridge-dialog.js'
import { FsBridge } from './bridge-fs.js'
import { GitBridge } from './bridge-git.js'
import { PtyBridge } from './bridge-pty.js'
import { SecretStore } from './bridge-secret.js'
import { HarnessSupervisor } from './harness-supervisor.js'
import { registerIpc } from './ipc.js'
import { AppLogger } from './logger.js'
import { DesktopWindow } from './window.js'

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  let supervisor: HarnessSupervisor | undefined
  let desktopWindow: DesktopWindow | undefined
  let updater: AppUpdater | undefined
  let ptyBridge: PtyBridge | undefined

  app.on('second-instance', () => desktopWindow?.focus())

  app.whenReady().then(async () => {
    app.setAppUserModelId('io.github.wrddgg.dshdesktop')

    const logger = new AppLogger(join(app.getPath('userData'), 'logs', 'desktop.log'))
    await logger.write('desktop', `Starting DSH Desktop ${app.getVersion()}`)

    const bootStore = new BootStateStore(join(app.getPath('userData'), 'boot-state.json'))
    await bootStore.load()

    supervisor = new HarnessSupervisor({
      dshHome: join(app.getPath('userData'), 'harness'),
      workspace: app.getPath('documents'),
      pluginSources: app.isPackaged
        ? {
            desktopPlugin: join(process.resourcesPath, 'dsh-desktop-plugin'),
            fileRefPlugin: join(process.resourcesPath, 'dsh-desktop-file-ref'),
            workbenchPlugin: join(process.resourcesPath, 'dsh-desktop-workbench'),
            pwshPlugin: join(process.resourcesPath, 'dsh-desktop-pwsh'),
            modelCapPlugin: join(process.resourcesPath, 'dsh-desktop-model-cap'),
            visionPlugin: join(process.resourcesPath, 'dsh-desktop-vision'),
            messageEditPlugin: join(process.resourcesPath, 'dsh-desktop-message-edit'),
          }
        : {},
      dshBin: app.isPackaged
        ? join(
            process.resourcesPath,
            'dsh-runtime',
            'node_modules',
            '@deepseek-ai',
            'dsh',
            'lib',
            'bin.js',
          )
        : undefined,
      logger,
      bootStore,
      lastGoodDir: join(app.getPath('userData'), 'last-good-profile'),
    })
    updater = new AppUpdater(logger)
    desktopWindow = new DesktopWindow(supervisor)

    const fsBridge = new FsBridge({
      fallbackRoot: app.getPath('documents'),
      log: (scope, message) => void logger.write(scope, message),
    })
    const dialogBridge = new DialogBridge(() => desktopWindow?.browserWindow)
    const secretStore = new SecretStore((scope, message) => void logger.write(scope, message))
    const gitBridge = new GitBridge()
    ptyBridge = new PtyBridge({ fallbackCwd: app.getPath('documents') })

    registerIpc({
      updater,
      supervisor,
      logger,
      bootStore,
      fsBridge,
      dialogBridge,
      secretStore,
      gitBridge,
      ptyBridge,
      send: (channel, ...args) => desktopWindow?.send(channel, ...args),
    })
    supervisor.on('state', (state: RuntimeState) => {
      desktopWindow?.sendRuntimeState(state)
      if (state.status === 'ready' && state.url !== undefined) {
        void desktopWindow?.showHarness(state.url)
          .then(() => logger.write('desktop', 'DSH page loaded with the Desktop preload bridge'))
          .catch((error: unknown) => {
            void logger.write('desktop:error', error instanceof Error ? error.stack ?? error.message : String(error))
          })
      }
    })
    supervisor.on('boot-state-changed', (snapshot) => {
      desktopWindow?.sendBootState(snapshot)
    })
    updater.on('state', (state: UpdateState) => desktopWindow?.sendUpdateState(state))
    updater.on('notification-clicked', () => desktopWindow?.focus())

    await desktopWindow.create()
    updater.startAutomaticChecks()
    await supervisor.start().catch((error: unknown) => {
      void logger.write('desktop:error', error instanceof Error ? error.stack ?? error.message : String(error))
    })
  }).catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    updater?.stopAutomaticChecks()
    ptyBridge?.dispose()
    if (supervisor !== undefined) void supervisor.stop()
  })
}
