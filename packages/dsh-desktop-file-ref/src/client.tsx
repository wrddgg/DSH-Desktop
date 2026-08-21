/**
 * DSH Desktop file-reference client plugin.
 *
 * Adds Codex-style file references to the conversation composer:
 *  - drag files/folders into the chat → reference chips (paths handed to the
 *    model, which reads them with its own tools);
 *  - `@` menu source "workspace-files" for keyboard search;
 *  - a paperclip action in the composer tool row (native multi-file picker).
 * Images keep the official vision intake (mixed drops are re-dispatched).
 *
 * Built by scripts/build-plugins.mjs into lib/client.js (lazy-CJS factory
 * handoff consumed by window.__ModuleLoader__).
 */
import { classifyFiles, displayBasename, formatSize, isInsideRoot, MAX_REF_COUNT, quotePath, serializeFileRef } from './refs-core'

declare global {
  interface Window {
    __ModuleLoader__?: {
      load(handoff: { id: string; factory: (require: (spec: string) => any) => any }): void
    }
    dshDesktop?: any
  }
}

const PLUGIN_ID = '@wrddgg/dsh-desktop-file-ref'
const SOURCE_NAME = 'workspace-files'

window.__ModuleLoader__?.load({
  id: PLUGIN_ID,
  factory: (require) => {
    const React = require('react')
    const { DropOverlay } = require('@deepseek-ai/dsh-client-ui-attachment')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const IconPaperclipOutline16 = primitives?.IconPaperclipOutline16

    const styleId = 'dsh-desktop-file-ref-styles'
    const styles = `
      .dshFileRefAttach{display:grid;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:7px;place-items:center;cursor:pointer}
      .dshFileRefAttach:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshFileRefAttach:focus-visible{outline:3px solid color-mix(in srgb,#4176e6 35%,transparent);outline-offset:2px}
      .dshFileRefAttach:disabled{cursor:default;opacity:.5}
      .dshFileRefOverlay{z-index:60;pointer-events:none}
    `

    function ensureStyles() {
      if (document.getElementById(styleId)) return
      const tag = document.createElement('style')
      tag.id = styleId
      tag.dataset.plugin = PLUGIN_ID
      tag.textContent = styles
      document.head.appendChild(tag)
    }

    /** Plugin-wide workspace root knowledge, refreshed by the composer slot. */
    const rootState: { current: string | undefined } = { current: undefined }

    function readCaret(draft: string): number {
      const el = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) {
        const start = el.selectionStart
        if (typeof start === 'number' && start <= draft.length) return start
      }
      return draft.length
    }

    function isAcceptableDrop(files: readonly File[]): boolean {
      return files.length > 0 && files.length <= MAX_REF_COUNT
    }

    function apply(ctx: any): void {
      const api = window.dshDesktop
      if (!api) return
      ensureStyles()

      // ------------------------------------------------------------------
      // @ trigger source: keyboard file search (Codex @file).
      // ------------------------------------------------------------------
      const source = {
        trigger: '@' as const,
        name: SOURCE_NAME,
        order: 10,
        async candidates(_session: unknown, req: { query: string; signal: AbortSignal }) {
          const query = (req.query ?? '').trim()
          if (query.length === 0) return []
          try {
            const result = await api.fs.search(query, { root: rootState.current ?? undefined, limit: 20 })
            if (!result || result.ok !== true || !Array.isArray(result.entries)) return []
            return result.entries.map((entry: any) => ({
              name: entry.path,
              description: entry.isDirectory ? '文件夹' : `文件 · ${formatSize(entry.size)}`,
              icon: entry.isDirectory ? '📁' : '📄',
            }))
          } catch {
            return []
          }
        },
        onPick(pick: { candidate: { name: string } }) {
          const path = pick.candidate.name
          return {
            insert: {
              source: SOURCE_NAME,
              ref: path,
              label: displayBasename(path),
              clipboardText: quotePath(path),
            },
          }
        },
        codec: {
          clipboardText(ref: string) {
            return quotePath(ref)
          },
          async serialize(ref: string) {
            const stat = await api.fs.stat(ref)
            if (!stat || stat.ok !== true || stat.exists !== true) {
              throw new Error(`引用的文件不存在或无法访问：${ref}`)
            }
            return serializeFileRef(
              {
                path: ref,
                kind: stat.isDirectory ? 'dir' : 'file',
                size: stat.size,
                readonly: !isInsideRoot(ref, rootState.current),
              },
              (path: string, maxBytes: number) => api.fs.read(path, { maxBytes }),
            )
          },
        },
      }

      let sourceRegistered = false
      const registerSource = () => {
        if (sourceRegistered) return
        const service = ctx.get?.('inputTriggers')
        if (!service?.registerSource) return
        try {
          service.registerSource(source)
          sourceRegistered = true
        } catch (error) {
          console.warn('[dsh-desktop-file-ref] registerSource failed', error)
        }
      }
      registerSource()

      // ------------------------------------------------------------------
      // Composer tool-row action + drop handling.
      // ------------------------------------------------------------------
      function AttachAction(props: any) {
        ensureStyles()
        const sessionId = props?.sessionId
        const session = props?.session
        const input = props?.input
        const sessions = typeof props?.useSessions === 'function' ? props.useSessions() : undefined
        const [busy, setBusy] = React.useState(false)

        // Track the workspace root for search / readonly badges.
        const root = resolveRoot(sessionId, session, sessions)
        if (root) rootState.current = root

        // Keep the latest input machine state reachable from event handlers.
        const inputRef = React.useRef({ draft: '', draftRev: 0 })
        inputRef.current = { draft: input?.draft ?? '', draftRev: input?.draftRev ?? 0 }
        const sessionRef = React.useRef(sessionId)
        sessionRef.current = sessionId

        const insertRefs = React.useCallback((paths: readonly string[]) => {
          const id = sessionRef.current
          if (!id) return false
          const actx = ctx.sessions?.scope?.(id)
          if (!actx) return false
          let state = inputRef.current
          let caret = readCaret(state.draft)
          let rev = state.draftRev
          let appliedAny = false
          for (const path of paths.slice(0, MAX_REF_COUNT)) {
            const reference = {
              source: SOURCE_NAME,
              ref: path,
              label: displayBasename(path),
              clipboardText: quotePath(path),
            }
            let applied = false
            try {
              applied = actx.bail(actx, 'slash/input-insert-reference', {
                reference,
                span: { start: caret, end: caret, draftRev: rev },
              }) === true
            } catch {
              applied = false
            }
            if (!applied) {
              // Draft moved under us (CAS miss): degrade to a plain path line.
              try {
                const latest = inputRef.current
                applied = actx.bail(actx, 'slash/input-insert-text', {
                  text: quotePath(path),
                  span: { start: latest.draft.length, end: latest.draft.length, draftRev: latest.draftRev },
                }) === true
              } catch {
                applied = false
              }
            }
            if (!applied) break
            appliedAny = true
            caret += 1
            rev += 1
          }
          return appliedAny
        }, [])

        const [dropState, setDropState] = React.useState({ active: false, count: 0, hasNonImage: false, canAccept: true })
        const dropRef = React.useRef(dropState)
        dropRef.current = dropState

        React.useEffect(() => {
          let depth = 0
          const filesOf = (event: DragEvent): File[] => {
            const transfer = event.dataTransfer
            if (!transfer || !Array.from(transfer.types).includes('Files')) return []
            return [...(transfer.files ?? [])]
          }
          const update = (files: readonly File[], active: boolean) => {
            const { images, others } = classifyFiles(files)
            setDropState({
              active,
              count: files.length,
              hasNonImage: others.length > 0,
              canAccept: Boolean(sessionRef.current) && isAcceptableDrop(files),
            })
          }
          const onDragEnter = (event: DragEvent) => {
            const files = filesOf(event)
            if (files.length === 0) return
            depth += 1
            update(files, true)
          }
          const onDragOver = (event: DragEvent) => {
            if (filesOf(event).length === 0) return
            update(filesOf(event), true)
          }
          const onDragLeave = (event: DragEvent) => {
            if (filesOf(event).length === 0) return
            depth = Math.max(0, depth - 1)
            if (depth === 0) setDropState(prev => ({ ...prev, active: false }))
          }
          const onDrop = (event: DragEvent) => {
            if ((window as any).__dshFileRefSynthetic === true) return
            const files = filesOf(event)
            if (files.length === 0) return
            depth = 0
            setDropState(prev => ({ ...prev, active: false }))
            const { images, others } = classifyFiles(files)
            if (others.length === 0) return // pure images: official intake owns it
            event.preventDefault()
            event.stopImmediatePropagation()

            const paths = others
              .map(file => pathOf(file))
              .filter((path): path is string => typeof path === 'string' && path.length > 0)
            if (paths.length > 0) insertRefs(paths)

            // Let the official conversation controller intake the images:
            // re-dispatch a synthetic drop carrying only the image File objects.
            if (images.length > 0) {
              try {
                const transfer = new DataTransfer()
                for (const file of images) transfer.items.add(file)
                ;(window as any).__dshFileRefSynthetic = true
                document.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
                ;(window as any).__dshFileRefSynthetic = false
              } catch {
                ;(window as any).__dshFileRefSynthetic = false
              }
            }
          }
          const onDragEnd = () => {
            depth = 0
            setDropState(prev => ({ ...prev, active: false }))
          }
          document.addEventListener('dragenter', onDragEnter, true)
          document.addEventListener('dragover', onDragOver, true)
          document.addEventListener('dragleave', onDragLeave, true)
          document.addEventListener('drop', onDrop, true)
          window.addEventListener('dragend', onDragEnd)
          return () => {
            document.removeEventListener('dragenter', onDragEnter, true)
            document.removeEventListener('dragover', onDragOver, true)
            document.removeEventListener('dragleave', onDragLeave, true)
            document.removeEventListener('drop', onDrop, true)
            window.removeEventListener('dragend', onDragEnd)
          }
        }, [insertRefs])

        const pickFiles = React.useCallback(async () => {
          setBusy(true)
          try {
            const result = await api.dialog.pickFiles()
            if (result?.ok === true && Array.isArray(result.paths) && result.paths.length > 0) {
              insertRefs(result.paths)
            }
          } finally {
            setBusy(false)
          }
        }, [insertRefs])

        const overlay = dropState.active && dropState.hasNonImage
          ? React.createElement(DropOverlay, {
              disabled: !dropState.canAccept,
              labels: {
                title: dropState.canAccept
                  ? `松开以引用 ${dropState.count} 个文件`
                  : '当前无法接收文件引用',
                desc: dropState.canAccept ? '图片仍作为附件发送；文件以路径引用交给模型读取' : undefined,
              },
            })
          : null

        const attachButton = React.createElement('button', {
          type: 'button',
          className: 'dshFileRefAttach',
          disabled: busy || !sessionRef.current,
          title: '引用文件（也可以把文件拖进对话区）',
          'aria-label': '引用文件',
          onClick: () => void pickFiles(),
        }, IconPaperclipOutline16 ? React.createElement(IconPaperclipOutline16, { size: 16 }) : '📎')

        return React.createElement(React.Fragment, null, attachButton, overlay)
      }

      try {
        ctx.slots.inject('conversation.input.left', function* () {
          yield ctx.slots.register(
            { name: 'conversation.input.left', id: 'desktop-file-ref-attach', order: 35, label: '引用文件' },
            AttachAction,
          )
        })
      } catch (error) {
        console.warn('[dsh-desktop-file-ref] composer slot unavailable', error)
      }
    }

    function resolveRoot(sessionId: unknown, session: any, sessions: any): string | undefined {
      const direct = session?.header?.cwd ?? session?.cwd
      if (typeof direct === 'string' && direct.length > 0) return direct
      const byId = sessions?.byId
      if (byId !== null && typeof byId === 'object') {
        const match = (sessionId !== undefined ? byId[sessionId] : undefined)
          ?? (sessions?.current !== undefined ? byId[sessions.current] : undefined)
        if (match !== undefined && typeof match.cwd === 'string' && match.cwd.length > 0) return match.cwd
      }
      return undefined
    }

    function pathOf(file: File): string {
      try {
        if (typeof (window.dshDesktop as any)?.getPathForFile === 'function') {
          return (window.dshDesktop as any).getPathForFile(file) ?? ''
        }
      } catch {
        // fall through to the legacy field
      }
      return typeof (file as any).path === 'string' ? (file as any).path : ''
    }

    return { apply, inject: ['slots', 'sessions'] }
  },
})
