import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { patchNativePickerWorkerSource } from './runtime-patches.mjs'

const projectRoot = resolve(import.meta.dirname, '..')
const sourceNodeModules = join(projectRoot, 'node_modules')
const runtimeRoot = join(projectRoot, 'runtime-resources', 'node_modules')
const roots = [
  '@deepseek-ai/dsh',
  '@deepseek-ai/cordis-plugin-group',
  '@koromix/koffi-win32-x64',
]

function isInside(path, parent) {
  const relativePath = relative(parent, path)
  return relativePath === ''
    || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

async function readManifest(packageDir) {
  return JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
}

async function resolvePackage(name, fromPackageDir = projectRoot) {
  const packagePath = name.split('/')
  let cursor = fromPackageDir
  while (true) {
    const candidate = join(cursor, 'node_modules', ...packagePath)
    try {
      const manifest = await readManifest(candidate)
      if (manifest.name === name) return candidate
    } catch {
      // Keep walking through the same node_modules search path Node uses.
    }

    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  throw new Error(`Could not locate package ${name} from ${fromPackageDir}`)
}

const queue = roots.map(name => ({ name, fromPackageDir: projectRoot, required: true }))
const packages = new Map()

while (queue.length > 0) {
  const request = queue.shift()
  let packageDir
  try {
    packageDir = await resolvePackage(request.name, request.fromPackageDir)
  } catch (error) {
    if (!request.required) continue
    throw new Error(
      `Required runtime package ${request.name} could not be resolved from ${request.fromPackageDir}`,
      { cause: error },
    )
  }

  if (!isInside(packageDir, sourceNodeModules)) {
    throw new Error(`Runtime package resolved outside node_modules: ${packageDir}`)
  }
  if (packages.has(packageDir)) continue

  const manifest = await readManifest(packageDir)
  packages.set(packageDir, manifest)

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    queue.push({ name, fromPackageDir: packageDir, required: true })
  }
  for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
    queue.push({ name, fromPackageDir: packageDir, required: false })
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    queue.push({
      name,
      fromPackageDir: packageDir,
      required: manifest.peerDependenciesMeta?.[name]?.optional !== true,
    })
  }
}

await rm(dirname(runtimeRoot), { recursive: true, force: true })
await mkdir(runtimeRoot, { recursive: true })

const records = [...packages.entries()]
for (let index = 0; index < records.length; index += 16) {
  await Promise.all(records.slice(index, index + 16).map(async ([source]) => {
    const relativePath = relative(sourceNodeModules, source)
    const destination = join(runtimeRoot, relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      force: true,
      filter(path) {
        const pathWithinPackage = relative(source, path)
        return pathWithinPackage === ''
          || pathWithinPackage.split(sep)[0] !== 'node_modules'
      },
    })
  }))
}

const nativePickerWorker = join(
  runtimeRoot,
  '@deepseek-ai',
  'dsh-host-directory-picker-native',
  'lib',
  'worker.cjs',
)
const workerSource = await readFile(nativePickerWorker, 'utf8')
await writeFile(nativePickerWorker, patchNativePickerWorkerSource(workerSource), 'utf8')

console.log(`Prepared standalone DSH runtime with ${packages.size} packages at ${runtimeRoot}`)
