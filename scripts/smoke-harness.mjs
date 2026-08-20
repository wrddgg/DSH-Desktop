import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

/**
 * Headless harness smoke: builds the desktop profile from source, boots the
 * pinned DSH runtime under Electron node mode with the desktop environment
 * (including DSH_PERMISSION_MODE), waits for readiness, and verifies that the
 * file-ref client bundle endpoint is served. Exits non-zero on failure.
 */
const root = resolve(import.meta.dirname, '..')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const dshBin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

const temporary = await mkdtemp(join(tmpdir(), 'dsh-harness-smoke-'))
const profileRunner = join(temporary, 'profile-runner.cjs')

try {
  await build({
    entryPoints: [resolve(root, 'src/main/profile.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    outfile: profileRunner,
    external: ['electron'],
    logLevel: 'silent',
  })

  const { ensureDesktopProfile } = await import(pathToFileURL(profileRunner).href)
  const home = join(temporary, 'home')
  await ensureDesktopProfile(home, {
    desktopPlugin: join(root, 'packages', 'dsh-desktop-plugin'),
    fileRefPlugin: join(root, 'packages', 'dsh-desktop-file-ref'),
  })

  const child = spawn(
    electron,
    ['--expose-internals', dshBin, '--profile', 'dsh-desktop-app', '--port', '0'],
    {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: home,
        DSH_PERMISSION_MODE: 'danger-full-access',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let output = ''
  const capture = (chunk) => {
    output += chunk.toString()
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`Harness smoke timed out.\n${output.slice(-4000)}`)), 90_000)
    const scan = () => {
      const match = output.match(/https?:\/\/127\.0\.0\.1:\d+/)
      if (match) {
        clearTimeout(timer)
        resolveUrl(match[0])
      }
    }
    child.stdout.on('data', scan)
    child.stderr.on('data', scan)
  })

  // Readiness probe.
  let ready = false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (response.status < 500) {
        ready = true
        break
      }
    } catch {
      // retry
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  if (!ready) throw new Error(`Harness never became ready at ${url}`)

  const endpoint = `${url}/plugins/@wrddgg/dsh-desktop-file-ref/client.js`
  const bundleResponse = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!bundleResponse.ok) throw new Error(`Client bundle endpoint ${endpoint} -> ${bundleResponse.status}`)
  const body = await bundleResponse.text()
  if (!body.includes('dsh-desktop-file-ref')) throw new Error('Served bundle does not look like the file-ref plugin')
  if (!body.includes('__ModuleLoader__')) throw new Error('Served bundle is missing the module-loader handoff')

  console.log(`Harness smoke passed: ${url} ready, file-ref client bundle served (${body.length} bytes).`)

  // Tear the harness down the same way the supervisor does (taskkill tree,
  // after detaching the stdio pipes) to avoid the Electron-node teardown
  // assertion on Windows.
  child.stdout.destroy()
  child.stderr.destroy()
  child.kill()
  await new Promise(resolveExit => {
    const timer = setTimeout(resolveExit, 3_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolveExit()
    })
  })
  if (child.pid !== undefined) {
    const killer = spawn(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' },
    )
    await new Promise(resolveKill => killer.once('exit', resolveKill))
  }
  process.exit(0)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
