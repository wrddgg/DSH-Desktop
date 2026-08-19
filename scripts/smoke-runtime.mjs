import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const applicationRoot = resolve(process.argv[2] ?? 'release/win-unpacked')
const executable = join(applicationRoot, 'DSH Desktop.exe')
const nodePty = join(
  applicationRoot,
  'resources',
  'dsh-runtime',
  'node_modules',
  'node-pty',
)

await Promise.all([access(executable), access(join(nodePty, 'package.json'))])

const probe = `
const pty = require(${JSON.stringify(nodePty)})
const child = pty.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'echo DSH_PTY_OK'], {
  name: 'xterm-color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
})
let output = ''
const timer = setTimeout(() => {
  console.error('node-pty smoke test timed out')
  child.kill()
  process.exit(2)
}, 10000)
child.onData(data => { output += data })
child.onExit(({ exitCode }) => {
  clearTimeout(timer)
  if (exitCode === 0 && output.includes('DSH_PTY_OK')) {
    console.log('Native node-pty smoke test passed.')
    process.exit(0)
  }
  console.error('node-pty smoke test failed:', { exitCode, output })
  process.exit(1)
})
`

const child = spawn(executable, ['-e', probe], {
  cwd: applicationRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
})

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject)
  child.once('exit', code => resolveExit(code ?? 1))
})

if (exitCode !== 0) process.exitCode = exitCode
