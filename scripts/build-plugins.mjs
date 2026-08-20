import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

/**
 * Builds every client plugin listed in plugins.json with a clientEntry into
 * its declared clientBundle. The output keeps the lazy-CJS factory handoff
 * (`window.__ModuleLoader__.load({ id, factory })`) that the DSH web shell
 * consumes; `@deepseek-ai/*` and react module specifiers stay external so
 * they resolve through the shell's client module table at runtime.
 */

const root = resolve(import.meta.dirname, '..')
const registry = JSON.parse(await readFile(resolve(root, 'plugins.json'), 'utf8'))

const external = [
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  '@deepseek-ai/*',
  '@wrddgg/*',
]

let built = 0

for (const plugin of registry.plugins ?? []) {
  if (typeof plugin.clientEntry !== 'string') continue
  const entry = resolve(root, plugin.packageDir, plugin.clientEntry)
  const outfile = resolve(root, plugin.packageDir, plugin.clientBundle)

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    jsxDev: false,
    external,
    logLevel: 'info',
    legalComments: 'none',
    charset: 'utf8',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })
  built += 1
  console.log(`Built client bundle ${plugin.id} -> ${plugin.clientBundle}`)
}

if (built === 0) console.log('No client plugins with clientEntry to build.')
