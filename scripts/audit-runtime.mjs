import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const runtimeRoot = resolve(
  process.argv[2]
    ?? 'release/win-unpacked/resources/dsh-runtime/node_modules',
)
const runtimeParent = dirname(runtimeRoot)

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function collectPackages(nodeModulesDir, packages) {
  if (!await exists(nodeModulesDir)) return

  const entries = await readdir(nodeModulesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    if (entry.name.startsWith('@')) {
      const scopeDir = join(nodeModulesDir, entry.name)
      const scopedEntries = await readdir(scopeDir, { withFileTypes: true })
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory()) {
          await collectPackage(join(scopeDir, scopedEntry.name), packages)
        }
      }
      continue
    }

    await collectPackage(join(nodeModulesDir, entry.name), packages)
  }
}

async function collectPackage(packageDir, packages) {
  const manifestPath = join(packageDir, 'package.json')
  if (!await exists(manifestPath)) return

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  packages.push({ packageDir, manifest })
  await collectPackages(join(packageDir, 'node_modules'), packages)
}

function isInsideRuntime(path) {
  const relativePath = relative(runtimeRoot, path)
  return relativePath === ''
    || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

async function resolvesInsideRuntime(packageDir, dependency) {
  const dependencyPath = dependency.split('/')
  let cursor = packageDir

  while (isInsideRuntime(cursor) || cursor === runtimeParent) {
    const candidate = join(cursor, 'node_modules', ...dependencyPath)
    if (await exists(join(candidate, 'package.json'))) {
      return isInsideRuntime(candidate)
    }

    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  return false
}

const packages = []
await collectPackages(runtimeRoot, packages)

if (packages.length === 0) {
  throw new Error(`No packaged runtime dependencies found at ${runtimeRoot}`)
}

const missing = []
let checkedEdges = 0

for (const { packageDir, manifest } of packages) {
  const packageName = manifest.name ?? packageDir
  const required = new Map()

  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    required.set(dependency, 'dependency')
  }
  for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
    if (manifest.peerDependenciesMeta?.[dependency]?.optional !== true) {
      required.set(dependency, 'peerDependency')
    }
  }

  for (const [dependency, kind] of required) {
    checkedEdges += 1
    if (!await resolvesInsideRuntime(packageDir, dependency)) {
      missing.push({ packageName, dependency, kind })
    }
  }
}

if (missing.length > 0) {
  console.error(`Packaged runtime is missing ${missing.length} required dependency edge(s):`)
  for (const item of missing) {
    console.error(`- ${item.packageName} -> ${item.dependency} (${item.kind})`)
  }
  process.exitCode = 1
} else {
  console.log(`Runtime dependency audit passed: ${packages.length} packages, ${checkedEdges} required edges.`)
}
