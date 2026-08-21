import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

/**
 * Executes the REAL built message-edit client bundle (lib/client.js) in a
 * sandbox with a scripted React, then proves the double-click → edit →
 * resend chain: registration into the user node cell, dblclick entering
 * edit mode, textarea editing, and save calling setDraft + submit.
 */
describe('DSH Desktop message-edit bundle behavior', () => {
  it('registers the user node replacement and edits/resends on double-click', async () => {
    const bundle = await readFile(
      resolve(import.meta.dirname, '..', 'packages', 'dsh-desktop-message-edit', 'lib', 'client.js'),
      'utf8',
    )
    expect(bundle).toContain('window.__ModuleLoader__')

    let definition: any

    // ---- scripted React (hooks state machine) ----
    const states: unknown[] = []
    let cursor = 0
    const memo = new Map<number, unknown>()
    const React = {
      createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...(props ?? {}), children }, children }),
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (next: unknown) => { states[index] = next }]
      },
      useEffect: (effect: () => void) => {
        const index = cursor++
        if (!(index in memo)) memo.set(index, effect())
      },
      useRef: (initial: unknown) => {
        const index = cursor++
        if (!(index in memo)) memo.set(index, { current: initial })
        return memo.get(index)
      },
      useCallback: (fn: any) => fn,
    }

    const window = {
      __ModuleLoader__: { load: (value: any) => { definition = value } },
    }
    const document = {
      getElementById: () => undefined,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: () => undefined },
    }
    vm.runInNewContext(bundle, { window, document })
    expect(definition).toBeDefined()

    // ---- apply with a scripted slots registry ----
    const registrations: Array<{ name: string; key?: string; priority?: number }> = []
    let registeredComponent: any
    const plugin = definition.factory((id: string) => {
      if (id === 'react') return React
      if (id === '@deepseek-ai/dsh-client-ui-primitives') {
        return { MarkdownText: (props: any) => ({ type: 'markdown', props }) }
      }
      throw new Error(`Unexpected client dependency: ${id}`)
    })
    // Cordis 4 requires every ctx service property access to be injected;
    // an empty inject list makes apply() fail with "cannot get property
    // 'slots' without inject" and silently disables the whole plugin.
    expect(plugin.inject).toEqual(expect.arrayContaining(['slots']))
    plugin.apply({
      slots: {
        inject: (_name: string, register: () => unknown) => {
          const result = register()
          if (result !== null && typeof result === 'object' && Symbol.iterator in result) {
            for (const _disposer of result as Iterable<unknown>) { /* runtime consumes */ }
          }
        },
        register: (options: any, component: any) => {
          registrations.push(options)
          registeredComponent = component
          return () => undefined
        },
      },
    })

    expect(registrations).toContainEqual({ name: 'conversation.chat.node', key: 'user', priority: -1 })
    expect(registeredComponent).toBeDefined()

    // ---- render: idle state → dblclick → edit → save ----
    const calls: string[] = []
    const inputActions = {
      setDraft: (text: string) => calls.push(`setDraft:${text}`),
      submit: () => calls.push('submit'),
    }
    const props = {
      node: { kind: 'user', seq: 1, time: 0, content: [{ type: 'text', text: '帮我修复登录 bug' }] },
      inputActions,
    }

    cursor = 0
    const idle = registeredComponent(props)
    expect(idle.props.onDoubleClick).toBeTypeOf('function')

    idle.props.onDoubleClick() // dblclick enters edit mode
    cursor = 0
    const editing = registeredComponent(props)
    let editor: any
    {
      const tree: any = editing
      const a: any = tree?.children
      const b: any = Array.isArray(a) ? a[0] : undefined
      const c: any = b?.props
      const d: any = c?.children
      const e: any = Array.isArray(d) ? d[0] : undefined
      editor = e?.props
      if (editor === undefined) {
        throw new Error(`steps: tree=${typeof tree} a=${Array.isArray(a) ? a.length : typeof a} b=${typeof b} c=${typeof c} d=${Array.isArray(d) ? d.length : typeof d} e=${typeof e}`)
      }
    }    expect(editor.value).toBe('帮我修复登录 bug')

    editor.onChange({ target: { value: '帮我修复登录 bug，并且加日志' } })
    cursor = 0
    const edited = registeredComponent(props)
    const saveButton = edited.children[0].props.children[1].props.children[0].props
    saveButton.onClick()
    expect(calls).toEqual(['setDraft:帮我修复登录 bug，并且加日志', 'submit'])
  })
})
