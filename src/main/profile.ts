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
  version: '1.0.0',
  dependencies: {
    '@wrddgg/dsh-desktop-plugin': '1.0.0',
  },
  dsh: {
    profile: {
      bundles: [
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        '@wrddgg/dsh-desktop-plugin',
      ],
    },
  },
  dshDesktop: {
    managed: true,
    schema: 1,
  },
}

export interface ProfileResult {
  profileDir: string
  created: boolean
}

export async function ensureDesktopProfile(
  dshHome: string,
  pluginSourceOverride?: string,
): Promise<ProfileResult> {
  const profileDir = join(dshHome, 'profiles', 'dsh-desktop-app')
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const pluginTarget = join(profileDir, 'node_modules', '@wrddgg', 'dsh-desktop-plugin')

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

  const require = createRequire(__filename)
  const pluginSource = pluginSourceOverride
    ?? dirname(require.resolve('@wrddgg/dsh-desktop-plugin/package.json'))
  await mkdir(pluginTarget, { recursive: true })
  await cp(pluginSource, pluginTarget, { recursive: true, force: true })

  return { profileDir, created }
}
