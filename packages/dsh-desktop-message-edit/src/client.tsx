/**
 * DSH Desktop message editing: replaces the official user-message node with
 * a double-click-to-edit version. Editing fills the composer with the edited
 * text and submits it as a new message (Codex-style "edit & resend").
 *
 * The replacement rides the keyed `conversation.chat.node` slot at a lower
 * priority; if this component ever crashes, the slot machinery abdicates it
 * and the official renderer takes over.
 */
declare global {
  interface Window {
    __ModuleLoader__?: {
      load(handoff: { id: string; factory: (require: (spec: string) => any) => any }): void
    }
  }
}

const PLUGIN_ID = '@wrddgg/dsh-desktop-message-edit'

window.__ModuleLoader__?.load({
  id: PLUGIN_ID,
  factory: (require) => {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const MarkdownText = primitives?.MarkdownText

    const styleId = 'dsh-desktop-message-edit-styles'
    const styles = `
      .dshMessageEdit{position:relative;min-width:0}
      .dshMessageEdit__hint{position:absolute;top:-18px;right:0;padding:2px 8px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:6px;font-size:10px;opacity:0;transition:opacity .12s ease;pointer-events:none}
      .dshMessageEdit:hover .dshMessageEdit__hint{opacity:1}
      .dshMessageEdit__editor{display:grid;gap:8px;width:100%}
      .dshMessageEdit__editor textarea{width:100%;min-height:96px;padding:10px 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:10px;font:13px/1.6 inherit;resize:vertical}
      .dshMessageEdit__editor textarea:focus{outline:3px solid color-mix(in srgb,#4176e6 30%,transparent);outline-offset:1px}
      .dshMessageEdit__actions{display:flex;gap:8px}
      .dshMessageEdit__actions button{min-height:28px;padding:4px 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:8px;font:600 12px/18px inherit;cursor:pointer}
      .dshMessageEdit__actions button[data-primary="true"]{color:#fff;background:#4176e6;border-color:#4176e6}
      .dshMessageEdit__actions button:hover{background:var(--dsw-alias-interactive-bg-hover)}
    `

    function ensureStyles() {
      if (document.getElementById(styleId)) return
      const tag = document.createElement('style')
      tag.id = styleId
      tag.dataset.plugin = PLUGIN_ID
      tag.textContent = styles
      document.head.appendChild(tag)
    }

    /** Extract plain text from a user message's content blocks. */
    function userMessageText(node: any): string {
      if (!Array.isArray(node?.content)) return ''
      return node.content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('\n')
    }

    function apply(ctx: any): void {
      ensureStyles()

      function EditableUserMessage(props: any) {
        ensureStyles()
        const node = props?.node
        const [editing, setEditing] = React.useState(false)
        const [draft, setDraft] = React.useState('')
        const text = userMessageText(node)
        const inputActions = props?.inputActions

        const beginEdit = () => {
          setDraft(text)
          setEditing(true)
        }
        const cancel = () => setEditing(false)
        const save = () => {
          const trimmed = draft.trim()
          if (trimmed.length === 0) {
            setEditing(false)
            return
          }
          if (inputActions !== undefined) {
            inputActions.setDraft(trimmed)
            inputActions.submit()
          }
          setEditing(false)
        }

        if (editing) {
          return React.createElement('div', { className: 'dshMessageEdit' },
            React.createElement('div', { className: 'dshMessageEdit__editor' },
              React.createElement('textarea', {
                value: draft,
                autoFocus: true,
                onChange: (event: any) => setDraft(event.target.value),
                onKeyDown: (event: any) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
                  if (event.key === 'Escape') cancel()
                },
              }),
              React.createElement('div', { className: 'dshMessageEdit__actions' },
                React.createElement('button', { type: 'button', 'data-primary': 'true', onClick: save }, '保存并发送'),
                React.createElement('button', { type: 'button', onClick: cancel }, '取消'),
              ),
            ),
          )
        }

        const body = MarkdownText !== undefined
          ? React.createElement(MarkdownText, { text })
          : React.createElement('span', null, text)
        return React.createElement('div', {
          className: 'dshMessageEdit',
          onDoubleClick: beginEdit,
          title: '双击编辑并重新发送',
        },
          React.createElement('span', { className: 'dshMessageEdit__hint' }, '双击编辑并重新发送'),
          body,
        )
      }

      try {
        ctx.slots.inject('conversation.chat.node', function* () {
          yield ctx.slots.register(
            { name: 'conversation.chat.node', key: 'user', priority: -1 },
            EditableUserMessage,
          )
        })
      } catch (error) {
        console.warn('[dsh-desktop-message-edit] chat node slot unavailable', error)
      }
    }

    return { apply, inject: [] }
  },
})
