window.__ModuleLoader__.load({
  id: '@wrddgg/dsh-desktop-plugin',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    let primitives = {}
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch { /* older DSH builds keep the fallback renderer */ }
    const DiffBlock = primitives.DiffBlock
    const IconEdit = primitives.IconEditOutline16
    const inject = ['slots', 'layout']
    const styleId = 'dsh-desktop-plugin-styles'
    const styles = `
      .dshDesktopUpdate{max-width:680px;padding:8px 4px 32px;color:var(--dsw-alias-label-primary)}.dshDesktopUpdate *{box-sizing:border-box}
      .dshDesktopUpdate__header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.dshDesktopUpdate__eyebrow{margin:0 0 5px;color:#4176e6;font:600 11px/16px "Cascadia Mono",Consolas,monospace;letter-spacing:.08em}
      .dshDesktopUpdate h2{margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.02em}.dshDesktopUpdate__lead{margin:7px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
      .dshDesktopUpdate__badge{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:5px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:999px;font-size:12px}.dshDesktopUpdate__badgeDot{width:8px;height:8px;background:#22c55e;border-radius:50%;box-shadow:0 0 0 4px color-mix(in srgb,#22c55e 15%,transparent)}
      .dshDesktopUpdate__rail{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr;align-items:center;padding:18px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:16px}.dshDesktopUpdate__node{min-width:0}.dshDesktopUpdate__nodeLabel{display:block;margin-bottom:4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.dshDesktopUpdate__nodeValue{display:block;overflow:hidden;color:var(--dsw-alias-label-primary);font:600 13px/20px "Cascadia Mono",Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.dshDesktopUpdate__connector{height:1px;margin:0 8px;background:var(--dsw-alias-line-border)}
      .dshDesktopUpdate__status{margin-top:14px;padding:16px 18px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:16px}.dshDesktopUpdate__statusLine{display:flex;align-items:center;justify-content:space-between;gap:12px}.dshDesktopUpdate__statusTitle{font-size:14px;font-weight:600;line-height:22px}.dshDesktopUpdate__message{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px;overflow-wrap:anywhere}
      .dshDesktopUpdate__progress{height:5px;margin-top:13px;overflow:hidden;background:color-mix(in srgb,#4176e6 14%,transparent);border-radius:99px}.dshDesktopUpdate__progress span{display:block;height:100%;background:#4176e6;border-radius:inherit;transition:width .2s ease}.dshDesktopUpdate__progress[data-indeterminate="true"] span{width:34%!important;animation:dshDesktopProgress 1.1s ease-in-out infinite alternate}.dshDesktopUpdate__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.dshDesktopUpdate button{min-height:36px;padding:7px 13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:10px;font:600 12px/18px inherit;cursor:pointer}.dshDesktopUpdate button:hover{background:var(--dsw-alias-interactive-bg-hover)}.dshDesktopUpdate button:focus-visible{outline:3px solid color-mix(in srgb,#4176e6 35%,transparent);outline-offset:2px}.dshDesktopUpdate button[data-primary="true"]{color:white;background:#4176e6;border-color:#4176e6}.dshDesktopUpdate button:disabled{cursor:default;opacity:.55}.dshDesktopUpdate__notes{margin-top:14px;padding-top:14px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-line-border);font-size:12px;line-height:19px;white-space:pre-wrap}.dshDesktopUpdate__unavailable{padding:18px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:14px;font-size:13px;line-height:20px}
      .dshDesktopUpdateAction{position:relative;display:grid;width:26px;height:26px;min-width:26px;padding:0;place-items:center;color:#fff;background:#2f92ed;border:0;border-radius:50%;box-shadow:0 1px 2px rgba(17,78,138,.24);cursor:pointer;transition:background .15s ease,box-shadow .15s ease,transform .15s ease}.dshDesktopUpdateAction:hover{background:#187fd8;box-shadow:0 2px 5px rgba(17,78,138,.3)}.dshDesktopUpdateAction:active{transform:scale(.94)}.dshDesktopUpdateAction:focus-visible{outline:3px solid color-mix(in srgb,#2f92ed 32%,transparent);outline-offset:2px}.dshDesktopUpdateAction:disabled{cursor:default;opacity:.82}.dshDesktopUpdateAction svg{display:block}.dshDesktopUpdateAction[data-status="downloading"]::after{position:absolute;inset:-3px;border:2px solid color-mix(in srgb,#2f92ed 22%,transparent);border-top-color:#2f92ed;border-radius:50%;content:"";animation:dshDesktopUpdateSpin .8s linear infinite}@keyframes dshDesktopUpdateSpin{to{transform:rotate(360deg)}}@keyframes dshDesktopProgress{from{transform:translateX(-100%)}to{transform:translateX(230%)}}
      .dshDesktopProgress{box-sizing:border-box;display:flex;align-items:center;gap:9px;width:100%;min-height:40px;padding:7px 8px 7px 6px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,#2f92ed 7%,transparent);border:1px solid color-mix(in srgb,#2f92ed 18%,transparent);border-radius:10px}.dshDesktopProgress:hover{background:color-mix(in srgb,#2f92ed 12%,transparent)}.dshDesktopProgress[data-wide="false"]{width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-color:transparent;border-radius:50%}.dshDesktopProgress__avatar{display:grid;width:26px;height:26px;flex:none;color:#fff;background:#2f92ed;border-radius:50%;place-items:center;font:700 9px/1 "Cascadia Mono",Consolas,monospace;letter-spacing:-.04em}.dshDesktopProgress[data-wide="false"] .dshDesktopProgress__avatar{width:30px;height:30px}.dshDesktopProgress__label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;font-weight:550;line-height:18px}.dshDesktopProgress__meta{min-width:34px;padding:2px 7px;color:#fff;background:#2f92ed;border-radius:999px;text-align:center;font:700 11px/17px "Cascadia Mono",Consolas,monospace}.dshDesktopProgress__srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .dshDesktopDiffRow{margin:3px 0 5px;padding:8px 10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 72%,transparent);border:1px solid var(--dsw-alias-line-border);border-radius:10px}.dshDesktopDiffRow__top{display:flex;align-items:center;gap:8px;min-width:0}.dshDesktopDiffRow__icon{display:grid;width:20px;height:20px;flex:none;color:#4176e6;place-items:center}.dshDesktopDiffRow__icon svg{width:15px;height:15px}.dshDesktopDiffRow__title{font-size:12px;font-weight:650;white-space:nowrap}.dshDesktopDiffRow__path{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font:11px/18px "Cascadia Mono",Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.dshDesktopDiffRow__actions{display:flex;flex:none;gap:6px;margin-left:auto}.dshDesktopDiffRow__button{min-height:26px;padding:3px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:7px;font:600 11px/18px inherit;cursor:pointer}.dshDesktopDiffRow__button[data-primary="true"]{color:#fff;background:#4176e6;border-color:#4176e6}.dshDesktopDiffRow__button:focus-visible{outline:3px solid color-mix(in srgb,#4176e6 35%,transparent);outline-offset:2px}.dshDesktopDiffRow__body{margin-top:7px;overflow:hidden}.dshDesktopDiffRow__status{margin-top:6px;color:var(--dsw-alias-label-tertiary);font-size:11px}
      .dshDesktopDiffPanel{position:fixed;z-index:29;top:58px;right:18px;bottom:18px;width:min(520px,calc(100vw - 32px));min-width:340px;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-0);border:1px solid var(--dsw-alias-line-border);border-radius:16px;box-shadow:0 24px 70px rgba(10,30,60,.22);pointer-events:auto}.dshDesktopDiffPanel__resize{position:absolute;top:16px;bottom:16px;left:-3px;width:7px;cursor:ew-resize}.dshDesktopDiffPanel__header{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid var(--dsw-alias-line-border)}.dshDesktopDiffPanel__heading{min-width:0;flex:1}.dshDesktopDiffPanel__eyebrow{margin:0 0 3px;color:#4176e6;font:600 10px/15px "Cascadia Mono",Consolas,monospace;letter-spacing:.12em}.dshDesktopDiffPanel__title{overflow:hidden;font-size:14px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.dshDesktopDiffPanel__path{margin-top:2px;overflow:hidden;color:var(--dsw-alias-label-secondary);font:11px/17px "Cascadia Mono",Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}.dshDesktopDiffPanel__nav{display:flex;gap:4px}.dshDesktopDiffPanel__iconButton{display:grid;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:7px;place-items:center;cursor:pointer}.dshDesktopDiffPanel__iconButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.dshDesktopDiffPanel__iconButton:disabled{cursor:default;opacity:.35}.dshDesktopDiffPanel__iconButton:focus-visible{outline:3px solid color-mix(in srgb,#4176e6 35%,transparent);outline-offset:2px}.dshDesktopDiffPanel__body{min-height:0;flex:1;padding:14px 16px;overflow:auto}.dshDesktopDiffPanel__hint{margin:0 0 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dshDesktopDiffPanel [data-diff]{width:100%;overflow:hidden;border:1px solid var(--dsw-alias-line-border);border-radius:10px}.dshDesktopDiffPanel [data-diff]>button{display:block;margin:7px 8px 5px auto;padding:2px 7px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-line-border);border-radius:6px;font-size:10px;cursor:pointer}.dshDesktopDiffPanel [data-diff]>div{font:12px/19px "Cascadia Mono",Consolas,monospace}.dshDesktopDiffPanel [data-diff]>div:nth-of-type(2){padding:5px 0;background:var(--dsw-alias-bg-layer-0)}.dshDesktopDiffPanel [data-diff]>div:nth-of-type(2)>div{padding:0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.dshDesktopDiffPanel [data-diff]>div:last-child{padding:8px 12px;color:var(--dsw-alias-label-tertiary);font-size:10px;border-top:1px solid var(--dsw-alias-line-border)}.dshDesktopDiffPanel__footer{padding:10px 16px;color:var(--dsw-alias-label-tertiary);font-size:11px;border-top:1px solid var(--dsw-alias-line-border)}
      .dshDesktopDiffPanel__fallback{overflow:auto;padding:12px;color:var(--dsw-alias-label-primary);font:12px/19px "Cascadia Mono",Consolas,monospace;white-space:pre-wrap;background:var(--dsw-alias-bg-layer-0);border:1px solid var(--dsw-alias-line-border);border-radius:10px}.dshDesktopDiffPanel__fallback .del{color:#c54a56;background:color-mix(in srgb,#c54a56 12%,transparent)}.dshDesktopDiffPanel__fallback .add{color:#21865a;background:color-mix(in srgb,#21865a 12%,transparent)}
      @media(max-width:620px){.dshDesktopUpdate__rail{grid-template-columns:1fr;gap:10px}.dshDesktopUpdate__connector{width:1px;height:12px;margin:0 0 0 6px}.dshDesktopDiffPanel{top:12px;right:12px;bottom:12px;left:12px;width:auto;min-width:0}}
      @media(prefers-reduced-motion:reduce){.dshDesktopUpdate__progress span,.dshDesktopUpdateOverlay__bar span{transition:none;animation:none}.dshDesktopUpdateAction{transition:none}}
    `

    const diffStore = {
      selectedCallId: undefined,
      entries: new Map(),
      listeners: new Set(),
      layout: undefined,
      snapshot() { return { selectedCallId: this.selectedCallId, entries: [...this.entries.values()] } },
      subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) },
      emit() { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot) },
      register(entry) {
        this.entries.set(entry.callId, entry)
        this.emit()
        return () => {
          if (this.entries.get(entry.callId) !== entry) return
          this.entries.delete(entry.callId)
          if (this.selectedCallId === entry.callId) this.selectedCallId = undefined
          this.emit()
        }
      },
      open(callId) {
        if (!this.entries.has(callId)) return
        this.selectedCallId = callId
        this.layout?.openDetails?.()
        this.emit()
      },
      close() {
        this.selectedCallId = undefined
        this.layout?.closeDetails?.()
        this.emit()
      },
      move(delta) {
        const items = [...this.entries.values()]
        const index = items.findIndex(item => item.callId === this.selectedCallId)
        const next = items[index < 0 ? 0 : index + delta]
        if (next !== undefined) this.open(next.callId)
      },
    }

    function ensureStyles() {
      if (document.getElementById(styleId)) return
      const tag = document.createElement('style')
      tag.id = styleId
      tag.dataset.plugin = '@wrddgg/dsh-desktop-plugin'
      tag.textContent = styles
      document.head.appendChild(tag)
    }

    function useDesktopData() {
      const api = window.dshDesktop
      const [info, setInfo] = React.useState(undefined)
      const [state, setState] = React.useState(undefined)
      React.useEffect(() => {
        if (!api) return undefined
        let active = true
        Promise.all([api.getInfo(), api.getUpdateState()]).then(([nextInfo, nextState]) => {
          if (active) { setInfo(nextInfo); setState(nextState) }
        })
        const off = api.onUpdateState(nextState => { if (active) setState(nextState) })
        return () => { active = false; off() }
      }, [api])
      return { api, info, state }
    }

    function updateActionFor(state) {
      if (!state || ['idle', 'current', 'installed', 'error'].includes(state.status)) return ['检查更新', 'check']
      if (state.status === 'available') return ['下载并自动安装', 'download']
      if (state.status === 'downloaded') return ['正在准备安装…', 'busy']
      if (state.status === 'verifying') return ['正在校验…', 'busy']
      if (state.status === 'restarting') return ['正在重启…', 'busy']
      return [state.status === 'checking' ? '正在检查…' : '正在下载…', 'busy']
    }

    function DownloadGlyph() {
      return React.createElement('svg', { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M8 2.25v7.1m0 0 2.55-2.55M8 9.35 5.45 6.8M3.25 11.1v1.15c0 .83.67 1.5 1.5 1.5h6.5c.83 0 1.5-.67 1.5-1.5V11.1', stroke: 'currentColor', strokeWidth: 1.45, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function runUpdateAction(api, action) {
      if (action === 'check') void api.checkForUpdates()
      if (action === 'download') void api.downloadAndInstall()
      if (action === 'install') void api.restartAndInstall()
    }

    function UpdateHeaderAction() {
      ensureStyles()
      const { api, state } = useDesktopData()
      if (!api || !state || !['available', 'downloading', 'verifying', 'restarting', 'downloaded'].includes(state.status)) return null
      const busy = ['downloading', 'verifying', 'restarting', 'downloaded'].includes(state.status)
      const version = state.availableVersion ? ` ${state.availableVersion}` : ''
      const label = state.status === 'downloading'
        ? `正在下载更新 ${Math.round(state.percent ?? 0)}%`
        : state.status === 'restarting'
          ? '正在重启并安装'
          : state.status === 'verifying'
            ? '正在校验更新'
            : state.status === 'downloaded'
              ? `重启并安装 DSH Desktop${version}`
              : `下载并自动安装 DSH Desktop${version}`
      return React.createElement('button', {
        type: 'button',
        className: 'dshDesktopUpdateAction',
        'data-status': state.status,
        disabled: busy,
        onClick: () => runUpdateAction(api, state.status === 'available' ? 'download' : 'busy'),
        title: label,
        'aria-label': label,
      }, React.createElement(DownloadGlyph))
    }

    function updateProgressFor(state) {
      if (!state) return undefined
      if (state.status === 'available') return 0
      if (state.status === 'downloading') return Math.max(0, Math.min(100, Math.round(state.percent ?? 0)))
      if (['verifying', 'restarting', 'downloaded'].includes(state.status)) return 100
      return undefined
    }

    function DesktopProgressAction({ wide }) {
      ensureStyles()
      const { api, state } = useDesktopData()
      const percent = updateProgressFor(state)
      if (!api || percent === undefined) return null
      const statusLabel = state.status === 'downloading'
        ? `正在下载 DSH Desktop，${percent}%`
        : state.status === 'available'
          ? 'DSH Desktop 有可用更新，0%'
          : state.status === 'restarting'
            ? '正在重启并安装 DSH Desktop，100%'
            : state.status === 'verifying'
              ? '正在校验 DSH Desktop 更新，100%'
              : 'DSH Desktop 更新已准备安装，100%'
      return React.createElement('div', {
        className: 'dshDesktopProgress',
        'data-wide': wide ? 'true' : 'false',
        role: 'status',
        'aria-label': statusLabel,
        title: statusLabel,
      }, React.createElement('span', { className: 'dshDesktopProgress__avatar', 'aria-hidden': 'true' }, 'DS'), wide ? React.createElement('span', { className: 'dshDesktopProgress__label' }, 'DSH Desktop') : null, React.createElement('span', { className: 'dshDesktopProgress__meta' }, `${percent}%`), wide ? React.createElement('span', { className: 'dshDesktopProgress__srOnly' }, state.message ?? statusLabel) : null)
    }

    function UpdateSection() {
      ensureStyles()
      const { api, info, state } = useDesktopData()
      if (!api) return React.createElement('div', { className: 'dshDesktopUpdate' }, React.createElement('div', { className: 'dshDesktopUpdate__unavailable' }, '更新功能只在 DSH Desktop Windows 应用中可用。'))
      const [label, action] = updateActionFor(state)
      const node = (labelText, value) => React.createElement('div', { className: 'dshDesktopUpdate__node' }, React.createElement('span', { className: 'dshDesktopUpdate__nodeLabel' }, labelText), React.createElement('span', { className: 'dshDesktopUpdate__nodeValue' }, value))
      const progress = ['downloading', 'verifying', 'restarting', 'downloaded'].includes(state?.status)
      const indeterminate = ['verifying', 'restarting', 'downloaded'].includes(state?.status)
      return React.createElement('div', { className: 'dshDesktopUpdate' },
        React.createElement('div', { className: 'dshDesktopUpdate__header' }, React.createElement('div', null, React.createElement('p', { className: 'dshDesktopUpdate__eyebrow' }, 'WINDOWS RELEASE CHANNEL'), React.createElement('h2', null, '更新'), React.createElement('p', { className: 'dshDesktopUpdate__lead' }, '下载完成后会校验更新、静默安装并自动重新打开。')), React.createElement('span', { className: 'dshDesktopUpdate__badge' }, React.createElement('span', { className: 'dshDesktopUpdate__badgeDot' }), info?.updateChannel === 'stable' ? '稳定通道' : '载入中')),
        React.createElement('div', { className: 'dshDesktopUpdate__rail', 'aria-label': '版本兼容链' }, node('Desktop', info ? `v${info.desktopVersion}` : '…'), React.createElement('span', { className: 'dshDesktopUpdate__connector' }), node('官方 DSH', info ? `v${info.dshVersion}` : '…'), React.createElement('span', { className: 'dshDesktopUpdate__connector' }), node('Desktop 插件', '内置')),
        React.createElement('div', { className: 'dshDesktopUpdate__status' },
          React.createElement('div', { className: 'dshDesktopUpdate__statusLine' }, React.createElement('span', { className: 'dshDesktopUpdate__statusTitle' }, state?.status === 'downloaded' ? '正在准备安装' : state?.status === 'installed' ? '已完成' : '版本状态'), state?.availableVersion ? React.createElement('span', { className: 'dshDesktopUpdate__nodeValue' }, `v${state.availableVersion}`) : null),
          React.createElement('p', { className: 'dshDesktopUpdate__message', role: 'status' }, state?.message ?? '正在读取更新状态…'),
          progress ? React.createElement('div', { className: 'dshDesktopUpdate__progress', 'data-indeterminate': indeterminate ? 'true' : 'false', 'aria-label': indeterminate ? '正在准备安装' : `下载进度 ${Math.round(state.percent ?? 0)}%` }, React.createElement('span', { style: { width: `${state.percent ?? 0}%` } })) : null,
          state?.releaseNotes ? React.createElement('div', { className: 'dshDesktopUpdate__notes' }, state.releaseNotes) : null,
          React.createElement('div', { className: 'dshDesktopUpdate__actions' }, React.createElement('button', { type: 'button', disabled: action === 'busy', 'data-primary': action !== 'check', onClick: () => runUpdateAction(api, action) }, label), React.createElement('button', { type: 'button', onClick: () => void api.openReleases() }, '查看发布记录'), React.createElement('button', { type: 'button', onClick: () => void api.openLogs() }, '打开日志'))))
    }

    function UpdateOverlay() {
      ensureStyles()
      const { api, state } = useDesktopData()
      if (!api || !state || !['available', 'downloading', 'verifying', 'restarting', 'downloaded'].includes(state.status)) return null
      const busy = ['downloading', 'verifying', 'restarting'].includes(state.status)
      const indeterminate = ['verifying', 'restarting'].includes(state.status)
      const action = state.status === 'available' ? 'download' : state.status === 'downloaded' ? 'install' : 'busy'
      const text = state.status === 'available' ? `DSH Desktop ${state.availableVersion ?? ''} 可用` : state.message ?? '正在更新…'
      return React.createElement('aside', { className: 'dshDesktopUpdateOverlay', role: 'status', 'aria-live': 'polite' },
        React.createElement('div', { className: 'dshDesktopUpdateOverlay__row' }, React.createElement('span', { className: 'dshDesktopUpdateOverlay__title' }, text), React.createElement('button', { type: 'button', className: 'dshDesktopUpdateOverlay__button', disabled: busy, onClick: () => runUpdateAction(api, action) }, state.status === 'available' ? '更新' : state.status === 'downloaded' ? '重启' : '处理中')),
        React.createElement('div', { className: 'dshDesktopUpdateOverlay__meta' }, state.status === 'downloading' ? `${Math.round(state.percent ?? 0)}% · ${(state.transferred ?? 0) > 0 ? `${Math.round((state.transferred ?? 0) / 1024 / 1024)} MB` : '准备中'}` : indeterminate ? '下载完成，正在校验并准备重启' : '完成后自动打开新版'),
        (state.status === 'downloading' || indeterminate) ? React.createElement('div', { className: 'dshDesktopUpdateOverlay__bar', 'data-indeterminate': indeterminate ? 'true' : 'false' }, React.createElement('span', { style: { width: `${state.percent ?? 0}%` } })) : null)
    }

    function parseArgs(argsRaw) {
      try { return JSON.parse(argsRaw) } catch { return undefined }
    }

    function diffFor(block) {
      const view = 'kind' in block ? block.resultView : block.callView
      if (!view || view.card !== 'diff' || !Array.isArray(view.diffs) || view.diffs.length === 0) return null
      const diffs = []
      for (const diff of view.diffs) {
        if (!diff || typeof diff !== 'object' || typeof diff.path !== 'string' || (diff.oldText !== null && typeof diff.oldText !== 'string') || typeof diff.newText !== 'string') return null
        diffs.push({ path: diff.path, oldText: diff.oldText, newText: diff.newText })
      }
      return diffs
    }

    function toolRowModel(toolName, block, cwd) {
      const done = 'kind' in block
      const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? ''
      const args = parseArgs(argsRaw)
      const path = args && typeof args === 'object' ? args.path ?? args.file_path : undefined
      const pathText = typeof path === 'string' && path.length > 0 ? path.split(/\r?\n/, 1)[0] : block.callId
      const root = typeof cwd === 'string' ? cwd.replace(/[/\\]+$/, '') : ''
      const displayPath = root && (pathText.startsWith(`${root}/`) || pathText.startsWith(`${root}\\`)) ? pathText.slice(root.length + 1) : pathText
      const state = !done ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
      return { path: typeof path === 'string' ? path : undefined, displayPath, state, title: toolName === 'write' ? 'Write' : 'Edit' }
    }

    function contentLines(text) {
      if (text === '') return []
      return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
    }

    function fallbackDiff({ diffs }) {
      const rows = []
      for (const diff of diffs) {
        rows.push({ kind: 'path', text: diff.path })
        if (diff.oldText !== null) for (const line of contentLines(diff.oldText)) rows.push({ kind: 'del', text: `- ${line}` })
        for (const line of contentLines(diff.newText)) rows.push({ kind: 'add', text: `+ ${line}` })
      }
      return React.createElement('div', { className: 'dshDesktopDiffPanel__fallback' }, rows.map((row, index) => React.createElement('div', { key: index, className: row.kind }, row.text)))
    }

    function DiffSurface({ diffs, maxLines }) {
      return DiffBlock
        ? React.createElement(DiffBlock, { diffs, maxLines })
        : fallbackDiff({ diffs })
    }

    function DiffToolView({ callId, toolName, block, cwd, openFile, inspect }) {
      ensureStyles()
      const model = toolRowModel(toolName, block, cwd)
      const diffs = diffFor(block)
      React.useEffect(() => {
        if (diffs === null) return undefined
        const entry = { callId, toolName, path: model.displayPath, diffs }
        return diffStore.register(entry)
      }, [callId, toolName, model.displayPath, diffs])
      const pathAction = model.path === undefined ? undefined : () => openFile(model.path)
      return React.createElement('div', { className: 'dshDesktopDiffRow', 'data-chat-call-id': callId },
        React.createElement('div', { className: 'dshDesktopDiffRow__top' },
          React.createElement('span', { className: 'dshDesktopDiffRow__icon', 'aria-hidden': 'true' }, IconEdit ? React.createElement(IconEdit, { size: 15 }) : '↳'),
          React.createElement('span', { className: 'dshDesktopDiffRow__title' }, model.title),
          pathAction ? React.createElement('button', { type: 'button', className: 'dshDesktopDiffRow__path', onClick: pathAction, title: model.path }, model.displayPath) : React.createElement('span', { className: 'dshDesktopDiffRow__path' }, model.displayPath),
          React.createElement('div', { className: 'dshDesktopDiffRow__actions' }, diffs ? React.createElement('button', { type: 'button', className: 'dshDesktopDiffRow__button', 'data-primary': 'true', onClick: () => diffStore.open(callId) }, '查看更改') : null, inspect ? React.createElement('button', { type: 'button', className: 'dshDesktopDiffRow__button', onClick: inspect }, 'Inspect') : null)),
        diffs ? React.createElement('div', { className: 'dshDesktopDiffRow__body' }, React.createElement(DiffSurface, { diffs, maxLines: 8 })) : React.createElement('div', { className: 'dshDesktopDiffRow__status' }, model.state === 'error' ? '修改失败，无法生成差异' : '正在等待修改结果…'))
    }

    function useDiffSnapshot() {
      const [snapshot, setSnapshot] = React.useState(diffStore.snapshot())
      React.useEffect(() => diffStore.subscribe(setSnapshot), [])
      return snapshot
    }

    function DiffOverlay() {
      ensureStyles()
      const snapshot = useDiffSnapshot()
      const items = snapshot.entries
      const index = items.findIndex(item => item.callId === snapshot.selectedCallId)
      const item = index < 0 ? undefined : items[index]
      if (item === undefined) return null
      const resize = (event) => {
        event.preventDefault()
        const startX = event.clientX
        const panel = event.currentTarget.parentElement
        const startWidth = panel?.getBoundingClientRect().width ?? 520
        const move = nextEvent => {
          const next = Math.max(340, Math.min(760, startWidth + startX - nextEvent.clientX))
          if (panel) panel.style.width = `${next}px`
        }
        const stop = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', stop)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', stop, { once: true })
      }
      return React.createElement('aside', { className: 'dshDesktopDiffPanel', role: 'dialog', 'aria-label': '代码更改' },
        React.createElement('span', { className: 'dshDesktopDiffPanel__resize', onPointerDown: resize, 'aria-hidden': 'true' }),
        React.createElement('header', { className: 'dshDesktopDiffPanel__header' },
          React.createElement('div', { className: 'dshDesktopDiffPanel__heading' }, React.createElement('p', { className: 'dshDesktopDiffPanel__eyebrow' }, 'CODE CHANGES'), React.createElement('div', { className: 'dshDesktopDiffPanel__title' }, item.toolName === 'write' ? 'Write' : 'Edit'), React.createElement('div', { className: 'dshDesktopDiffPanel__path', title: item.path }, item.path)),
          React.createElement('div', { className: 'dshDesktopDiffPanel__nav' }, React.createElement('button', { type: 'button', className: 'dshDesktopDiffPanel__iconButton', disabled: index <= 0, onClick: () => diffStore.move(-1), 'aria-label': '上一个更改' }, '‹'), React.createElement('button', { type: 'button', className: 'dshDesktopDiffPanel__iconButton', disabled: index >= items.length - 1, onClick: () => diffStore.move(1), 'aria-label': '下一个更改' }, '›'), React.createElement('button', { type: 'button', className: 'dshDesktopDiffPanel__iconButton', onClick: () => diffStore.close(), 'aria-label': '关闭代码更改' }, '×'))),
        React.createElement('div', { className: 'dshDesktopDiffPanel__body' }, React.createElement('p', { className: 'dshDesktopDiffPanel__hint' }, `${index + 1} / ${items.length} 个修改 · 右侧显示完整差异`), React.createElement(DiffSurface, { diffs: item.diffs, maxLines: Infinity })),
        React.createElement('footer', { className: 'dshDesktopDiffPanel__footer' }, '可拖动左侧边缘调整宽度')
      )
    }

    function apply(ctx) {
      diffStore.layout = ctx.layout
      ctx.slots.inject('settings.action', () => ctx.slots.register({ name: 'settings.action', id: 'desktop-update-action', order: 90, label: '更新 DSH Desktop' }, UpdateHeaderAction))
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'desktop-updates', order: 90, label: '更新' }, UpdateSection))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'desktop-progress', order: 90 }, DesktopProgressAction))
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({ name: 'shell.overlay', id: 'desktop-diff-overlay', order: 80 }, DiffOverlay)
      })
      ctx.slots.inject('tool.call.toolview', function* () {
        // Keyed tool views shadow the official file-mutation rows. The slot
        // contract requires an explicit rank when a shipped key is replaced.
        yield ctx.slots.register({ name: 'tool.call.toolview', key: 'edit', priority: -1, order: 90 }, DiffToolView)
        yield ctx.slots.register({ name: 'tool.call.toolview', key: 'write', priority: -1, order: 90 }, DiffToolView)
      })
    }
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
