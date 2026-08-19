import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const pluginRoot = resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-plugin')

describe('DSH Desktop plugin package', () => {
  it('declares official bundle and browser client faces', async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'package.json'), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
  })

  it('mounts itself as a normal Cordis loader row', async () => {
    const patch = await readFile(resolve(pluginRoot, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@wrddgg/dsh-desktop-plugin'")
  })

  it('ships the lazy-CJS client module factory required by DSH', async () => {
    const client = await readFile(resolve(pluginRoot, 'lib', 'client.js'), 'utf8')
    expect(client).toContain('window.__ModuleLoader__.load')
    expect(client).toContain("id: '@wrddgg/dsh-desktop-plugin'")
    expect(client).toContain("ctx.slots.inject('settings.action'")
    expect(client).toContain("ctx.slots.inject('settings.section'")
    expect(client).toContain("ctx.slots.inject('sidebar.footer.action'")
    expect(client).toContain('dshDesktopProgress')
    expect(client).toContain("['available', 'downloading', 'verifying', 'restarting', 'downloaded']")
    expect(client).toContain("ctx.slots.inject('shell.overlay'")
    expect(client).toContain("ctx.slots.inject('tool.call.toolview'")
    expect(client).toContain("查看更改")
  })

  it('renders the Codex-style header action only when an update is available', async () => {
    const client = await readFile(resolve(pluginRoot, 'lib', 'client.js'), 'utf8')
    let definition: { factory: (require: (id: string) => unknown) => { apply(ctx: unknown): void } } | undefined
    let downloadCalls = 0
    const states: unknown[] = []
    let cursor = 0
    let renderCount = 0
    const React = {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (next: unknown) => { states[index] = next }]
      },
      useEffect: (effect: () => unknown) => {
        if (renderCount === 0) effect()
      },
    }
    const window = {
      __ModuleLoader__: { load: (value: typeof definition) => { definition = value } },
      dshDesktop: {
        getInfo: async () => ({ updateChannel: 'stable' }),
        getUpdateState: async () => ({ status: 'available', availableVersion: '0.1.2' }),
        onUpdateState: () => () => undefined,
        downloadAndInstall: async () => { downloadCalls += 1 },
      },
    }
    const document = {
      getElementById: () => undefined,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: () => undefined },
    }

    vm.runInNewContext(client, { window, document })
    expect(definition).toBeDefined()
    const registered = new Map<string, () => unknown>()
    const registrations: Array<{ name: string; key?: string; id?: string; order?: number }> = []
    const plugin = definition!.factory((id) => {
      if (id !== 'react') throw new Error(`Unexpected client dependency: ${id}`)
      return React
    })
    plugin.apply({
      slots: {
        inject: (_name: string, register: () => unknown) => {
          const result = register()
          if (result !== null && typeof result === 'object' && Symbol.iterator in result) {
            for (const _disposer of result as Iterable<unknown>) { /* runtime consumes generator registrations */ }
          }
        },
        register: (options: { name: string; key?: string; id?: string; order?: number }, component: () => unknown) => {
          registered.set(options.name, component)
          registrations.push(options)
          return () => undefined
        },
      },
      layout: {
        openDetails: () => undefined,
        closeDetails: () => undefined,
      },
    })

    expect(registrations).toEqual(expect.arrayContaining([
      { name: 'sidebar.footer.action', id: 'desktop-progress', order: 90 },
      { name: 'shell.overlay', id: 'desktop-diff-overlay', order: 80 },
      { name: 'tool.call.toolview', key: 'edit', priority: -1, order: 90 },
      { name: 'tool.call.toolview', key: 'write', priority: -1, order: 90 },
    ]))

    const action = registered.get('settings.action')
    expect(action).toBeDefined()
    cursor = 0
    expect(action!()).toBeNull()
    renderCount += 1
    await new Promise(resolveTick => setTimeout(resolveTick, 0))
    cursor = 0
    const button = action!() as { type: string; props: { className: string; onClick(): void } }
    expect(button.type).toBe('button')
    expect(button.props.className).toBe('dshDesktopUpdateAction')
    button.props.onClick()
    expect(downloadCalls).toBe(1)

    const progress = registered.get('sidebar.footer.action')
    expect(progress).toBeDefined()
    cursor = 0
    const progressRow = (progress! as (props: { wide: boolean }) => unknown)({ wide: true }) as { props: { className: string; 'aria-label': string }; children: unknown[] }
    expect(progressRow.props.className).toBe('dshDesktopProgress')
    expect(progressRow.props['aria-label']).toContain('0%')
  })
})
