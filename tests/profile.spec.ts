import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureDesktopProfile } from '../src/main/profile.js'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('ensureDesktopProfile', () => {
  it('creates the official base, web, and Desktop bundle stack', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)

    const result = await ensureDesktopProfile(home)
    const manifest = JSON.parse(await readFile(join(result.profileDir, 'package.json'), 'utf8'))

    expect(result.created).toBe(true)
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@wrddgg/dsh-desktop-plugin',
    ])
    expect(await readFile(join(result.profileDir, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    const plugin = JSON.parse(await readFile(
      join(result.profileDir, 'node_modules', '@wrddgg', 'dsh-desktop-plugin', 'package.json'),
      'utf8',
    ))
    expect(plugin.name).toBe('@wrddgg/dsh-desktop-plugin')
  })

  it('refuses to overwrite an unmanaged Desktop app profile', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)
    const first = await ensureDesktopProfile(home)
    await writeFile(join(first.profileDir, 'package.json'), '{"name":"mine"}\n')

    await expect(ensureDesktopProfile(home)).rejects.toThrow('not managed by DSH Desktop')
  })
})
