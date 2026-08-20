import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
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

const manifest: ManagedProfileManifest = {
  name: '@dsh/profile-desktop-app',
  private: true,
  version: '1.1.0',
  dependencies: {
    '@wrddgg/dsh-desktop-plugin': '1.0.0',
    '@wrddgg/dsh-desktop-file-ref': '0.1.0',
  },
  dsh: {
    profile: {
      bundles: [
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        '@wrddgg/dsh-desktop-plugin',
        '@wrddgg/dsh-desktop-file-ref',
      ],
    },
  },
  dshDesktop: {
    managed: true,
    schema: 1,
  },
}

const BUNDLED_PLUGINS = [
  { name: '@wrddgg/dsh-desktop-plugin', version: '1.0.0' },
  { name: '@wrddgg/dsh-desktop-file-ref', version: '0.1.0' },
] as const

export interface PluginSources {
  desktopPlugin?: string
  fileRefPlugin?: string
}

export interface ProfileResult {
  profileDir: string
  created: boolean
}

function resolvePluginSource(name: string, override: string | undefined): string {
  if (override !== undefined) return override
  const require = createRequire(__filename)
  return dirname(require.resolve(`${name}/package.json`))
}

export async function ensureDesktopProfile(
  dshHome: string,
  pluginSources?: PluginSources,
): Promise<ProfileResult> {
  const profileDir = join(dshHome, 'profiles', 'dsh-desktop-app')
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

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

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
    const pluginSource = resolvePluginSource(plugin.name, overrides[plugin.name])
    const pluginTarget = join(profileDir, 'node_modules', ...plugin.name.split('/'))
    await mkdir(pluginTarget, { recursive: true })
    await cp(pluginSource, pluginTarget, { recursive: true, force: true })
  }

  return { profileDir, created }
}
