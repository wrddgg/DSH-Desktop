import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

interface ManagedProfileManifest {
  name: string
  private: true
  version: string
  dependencies: Record<string, string>
  dsh: {
    profile: {
      bundles: string[]
    }
  }
  dshDesktop: {
    managed: true
    schema: number
  }
}

/** Bundles the desktop always ships; Safe Mode loads exactly this stack. */
const CORE_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@wrddgg/dsh-desktop-plugin',
  '@wrddgg/dsh-desktop-file-ref',
] as const

const CORE_DEPENDENCIES = {
  '@wrddgg/dsh-desktop-plugin': '1.0.0',
  '@wrddgg/dsh-desktop-file-ref': '0.1.0',
} as const

const BUNDLED_PLUGINS = [
  { name: '@wrddgg/dsh-desktop-plugin', version: '1.0.0' },
  { name: '@wrddgg/dsh-desktop-file-ref', version: '0.1.0' },
] as const

export interface PluginSources {
  desktopPlugin?: string
  fileRefPlugin?: string
}

export interface ProfileOptions {
  /** Safe Mode: load only the official harness + product Core, never third-party plugins. */
  safe?: boolean
  /** Plugins to exclude from the managed profile (crash recovery blacklist). */
  disabledPlugins?: readonly string[]
}

export interface ProfileResult {
  profileDir: string
  created: boolean
}

export const NORMAL_PROFILE = 'dsh-desktop-app'
export const SAFE_PROFILE = 'dsh-desktop-app-safe'

function resolvePluginSource(name: string, override: string | undefined): string {
  if (override !== undefined) return override
  const require = createRequire(__filename)
  return dirname(require.resolve(`${name}/package.json`))
}

function buildManifest(options: ProfileOptions | undefined): ManagedProfileManifest {
  const disabled = new Set(options?.disabledPlugins ?? [])
  const dependencies: Record<string, string> = {}
  const bundles: string[] = []
  for (const bundle of CORE_BUNDLES) {
    if (disabled.has(bundle)) continue
    bundles.push(bundle)
  }
  for (const [name, version] of Object.entries(CORE_DEPENDENCIES)) {
    if (disabled.has(name)) continue
    dependencies[name] = version
  }
  return {
    name: `@dsh/profile-${options?.safe === true ? 'desktop-app-safe' : 'desktop-app'}`,
    private: true,
    version: '1.2.0',
    dependencies,
    dsh: { profile: { bundles } },
    dshDesktop: { managed: true, schema: 1 },
  }
}

export function profileDirOf(dshHome: string, safe: boolean): string {
  return join(dshHome, 'profiles', safe ? SAFE_PROFILE : NORMAL_PROFILE)
}

export async function ensureDesktopProfile(
  dshHome: string,
  pluginSources?: PluginSources,
  options?: ProfileOptions,
): Promise<ProfileResult> {
  const safe = options?.safe === true
  const profileDir = profileDirOf(dshHome, safe)
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')

  await mkdir(profileDir, { recursive: true })

  let created = false
  let existing: unknown
  try {
    existing = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (existing !== undefined) {
    const marker = (existing as { dshDesktop?: { managed?: boolean } }).dshDesktop?.managed
    if (marker !== true) {
      throw new Error(
        `The desktop profile already exists and is not managed by DSH Desktop: ${profileDir}`,
      )
    }
  } else {
    created = true
  }

  await writeFile(manifestPath, `${JSON.stringify(buildManifest(options), null, 2)}\n`, 'utf8')

  try {
    await readFile(patchPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await writeFile(patchPath, '[]\n', 'utf8')
  }

  const sources: PluginSources = pluginSources ?? {}
  const overrides: Record<string, string | undefined> = {
    '@wrddgg/dsh-desktop-plugin': sources.desktopPlugin,
    '@wrddgg/dsh-desktop-file-ref': sources.fileRefPlugin,
  }

  for (const plugin of BUNDLED_PLUGINS) {
    if ((options?.disabledPlugins ?? []).includes(plugin.name)) continue
    const pluginSource = resolvePluginSource(plugin.name, overrides[plugin.name])
    const pluginTarget = join(profileDir, 'node_modules', ...plugin.name.split('/'))
    await mkdir(pluginTarget, { recursive: true })
    await cp(pluginSource, pluginTarget, { recursive: true, force: true })
  }

  return { profileDir, created }
}

/** Snapshot the managed normal profile so a later crash loop can roll back. */
export async function snapshotProfile(profileDir: string, target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
  await mkdir(dirname(target), { recursive: true })
  await cp(profileDir, target, { recursive: true, force: true })
}

/** Restore the Last Known Good snapshot over the managed normal profile. */
export async function restoreProfile(source: string, profileDir: string): Promise<void> {
  await rm(profileDir, { recursive: true, force: true })
  await mkdir(profileDir, { recursive: true })
  await cp(source, profileDir, { recursive: true, force: true })
}
