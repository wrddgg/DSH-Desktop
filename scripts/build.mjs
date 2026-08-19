import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const outdir = resolve(root, 'dist')

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
}

await Promise.all([
  build({
    ...shared,
    entryPoints: [resolve(root, 'src/main/main.ts')],
    outfile: resolve(outdir, 'main.cjs'),
    format: 'cjs',
    external: ['electron', 'electron-updater', '@deepseek-ai/dsh'],
  }),
  build({
    ...shared,
    entryPoints: [resolve(root, 'src/preload/preload.ts')],
    outfile: resolve(outdir, 'preload.cjs'),
    format: 'cjs',
    external: ['electron'],
  }),
])

await cp(resolve(root, 'src/renderer'), resolve(outdir, 'renderer'), { recursive: true })
