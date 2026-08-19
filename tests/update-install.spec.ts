import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')

describe('update installation lifecycle', () => {
  it('checks automatically after startup and on a periodic interval', async () => {
    const source = await readFile(resolve(projectRoot, 'src', 'main', 'app-updater.ts'), 'utf8')
    expect(source).toContain('STARTUP_CHECK_DELAY_MS = 10_000')
    expect(source).toContain('PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000')
    expect(source).toContain('public startAutomaticChecks()')
  })

  it('shows one Windows notification per available version', async () => {
    const source = await readFile(resolve(projectRoot, 'src', 'main', 'app-updater.ts'), 'utf8')
    expect(source).toContain('Notification.isSupported()')
    expect(source).toContain('this.#notifiedVersion === info.version')
    expect(source).toContain("title: 'DSH Desktop 更新可用'")
    expect(source).toContain("this.emit('notification-clicked')")
  })

  it('stops Harness before handing control to the downloaded installer', async () => {
    const source = await readFile(resolve(projectRoot, 'src', 'main', 'ipc.ts'), 'utf8')
    const stop = source.indexOf('await supervisor.stop()')
    const install = source.indexOf('updater.quitAndInstall()')
    expect(stop).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(stop)
    const updater = await readFile(resolve(projectRoot, 'src', 'main', 'app-updater.ts'), 'utf8')
    expect(updater).toContain('autoUpdater.quitAndInstall(true, true)')
    expect(updater).toContain('public async downloadAndInstall')
  })

  it('configures NSIS to close the existing process tree automatically', async () => {
    const manifest = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
    const include = await readFile(resolve(projectRoot, 'build', 'installer.nsh'), 'utf8')
    expect(manifest.build.nsis.include).toBe('build/installer.nsh')
    expect(include).toContain('customCheckAppRunning')
    expect(include).toContain('/F /T /IM')
    expect(include).toContain('${APP_EXECUTABLE_FILENAME}')
  })
})
