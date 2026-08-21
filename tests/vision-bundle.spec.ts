import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

/**
 * Executes the REAL built vision client bundle and proves apply() registers
 * the settings sections, the drop router, and the wizard overlay without
 * throwing when the desktop bridge is present.
 */
describe('DSH Desktop vision bundle behavior', () => {
  it('registers all vision surfaces and tolerates a missing connection service', async () => {
    const bundle = await readFile(
      resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-vision', 'lib', 'client.js'),
      'utf8',
    )
    expect(bundle).toContain('window.__ModuleLoader__')

    let definition: any
    const React = {
      createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...(props ?? {}), children }, children }),
      useState: (initial: unknown) => [initial, () => undefined],
      useEffect: () => undefined,
      useRef: (initial: unknown) => ({ current: initial }),
      useCallback: (fn: any) => fn,
    }
    const window = {
      __ModuleLoader__: { load: (value: any) => { definition = value } },
      dshDesktop: {
        getPathForFile: () => '',
        fs: { search: async () => ({ ok: true, entries: [] }) },
        dialog: { pickFiles: async () => ({ ok: true, paths: [] }) },
      },
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    }
    const document = {
      getElementById: () => undefined,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: () => undefined },
    }
    vm.runInNewContext(bundle, { window, document })
    expect(definition).toBeDefined()

    const registrations: string[] = []
    let applyResult: unknown
    const plugin = definition.factory((id: string) => {
      if (id === 'react') return React
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
      throw new Error(`Unexpected client dependency: ${id}`)
    })
    // Cordis 4 requires every ctx service property access to be injected.
    expect(plugin.inject).toEqual(expect.arrayContaining(['slots', 'sessions']))

    plugin.apply({
      get: () => undefined,
      slots: {
        inject: (_name: string, register: () => unknown) => {
          const result = register()
          if (result !== null && typeof result === 'object' && Symbol.iterator in result) {
            for (const entry of result as Iterable<{ name: string; id?: string }>) {
              registrations.push(`${entry.name}:${entry.id ?? ''}`)
            }
          }
        },
        register: (options: any, component: any) => {
          registrations.push(`${options.name}:${options.id ?? ''}`)
          return () => undefined
        },
      },
    })
    expect(registrations).toEqual(expect.arrayContaining([
      'settings.section:desktop-model-capabilities',
      'settings.section:desktop-vision',
      'conversation.input.left:desktop-vision-router',
      'shell.overlay:desktop-vision-wizard',
    ]))
  })

  it('no-ops gracefully when the desktop bridge is absent (plain dsh web)', async () => {
    const bundle = await readFile(
      resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-vision', 'lib', 'client.js'),
      'utf8',
    )
    let definition: any
    const window = { __ModuleLoader__: { load: (value: any) => { definition = value } } }
    const document = {
      getElementById: () => undefined,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: () => undefined },
    }
    vm.runInNewContext(bundle, { window, document })
    const plugin = definition.factory((id: string) => {
      if (id === 'react') return { createElement: () => ({}) }
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
      throw new Error(`Unexpected client dependency: ${id}`)
    })
    expect(() => plugin.apply({ slots: { inject: () => undefined } })).not.toThrow()
  })
})
