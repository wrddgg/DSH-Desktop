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
      '@wrddgg/dsh-desktop-file-ref',
      '@wrddgg/dsh-desktop-workbench',
      '@wrddgg/dsh-desktop-pwsh',
    ])
    const patch = await readFile(join(result.profileDir, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('pwsh-sandbox')
    expect(patch).toContain('disabled: true')
    const plugin = JSON.parse(await readFile(
      join(result.profileDir, 'node_modules', '@wrddgg', 'dsh-desktop-plugin', 'package.json'),
      'utf8',
    ))
    expect(plugin.name).toBe('@wrddgg/dsh-desktop-plugin')
  })

  it('copies the file-reference plugin into the managed profile', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)

    const result = await ensureDesktopProfile(home)
    const fileRef = JSON.parse(await readFile(
      join(result.profileDir, 'node_modules', '@wrddgg', 'dsh-desktop-file-ref', 'package.json'),
      'utf8',
    ))
    expect(fileRef.name).toBe('@wrddgg/dsh-desktop-file-ref')
    expect(fileRef.dsh.client.platform).toBe('web')
  })

  it('creates a Safe Mode profile with the official + core stack only', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)

    const result = await ensureDesktopProfile(home, {}, { safe: true })
    expect(result.profileDir.endsWith('dsh-desktop-app-safe')).toBe(true)
    const manifest = JSON.parse(await readFile(join(result.profileDir, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('@dsh/profile-desktop-app-safe')
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@wrddgg/dsh-desktop-plugin',
      '@wrddgg/dsh-desktop-file-ref',
      '@wrddgg/dsh-desktop-workbench',
      '@wrddgg/dsh-desktop-pwsh',
    ])
  })

  it('keeps the official pwsh-sandbox when the desktop pwsh plugin is blacklisted', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)

    const result = await ensureDesktopProfile(home, {}, { disabledPlugins: ['@wrddgg/dsh-desktop-pwsh'] })
    const patch = await readFile(join(result.profileDir, 'cordis.patch.yml'), 'utf8')
    expect(patch).toBe('[]\n')
    const manifest = JSON.parse(await readFile(join(result.profileDir, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).not.toContain('@wrddgg/dsh-desktop-pwsh')
  })

  it('drops blacklisted plugins from bundles, dependencies, and copies', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)

    const result = await ensureDesktopProfile(home, {}, { disabledPlugins: ['@wrddgg/dsh-desktop-file-ref'] })
    const manifest = JSON.parse(await readFile(join(result.profileDir, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).not.toContain('@wrddgg/dsh-desktop-file-ref')
    expect(manifest.dependencies).not.toHaveProperty('@wrddgg/dsh-desktop-file-ref')
    await expect(readFile(
      join(result.profileDir, 'node_modules', '@wrddgg', 'dsh-desktop-file-ref', 'package.json'),
      'utf8',
    )).rejects.toThrow()
  })

  it('refuses to overwrite an unmanaged Desktop app profile', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
    temporary.push(home)
    const first = await ensureDesktopProfile(home)
    await writeFile(join(first.profileDir, 'package.json'), '{"name":"mine"}\n')

    await expect(ensureDesktopProfile(home)).rejects.toThrow('not managed by DSH Desktop')
  })
})
