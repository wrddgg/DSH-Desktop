"use strict";

// packages/dsh-desktop-workbench/src/workbench-core.ts
function stripAnsi(text) {
  return text.replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, "").replace(/\u001B\[[0-9;:?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}
function basename(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
function parentOf(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index < 0) return void 0;
  const parent = trimmed.slice(0, index);
  if (parent.length === 0) return void 0;
  if (/^[A-Za-z]:$/.test(parent)) return void 0;
  return parent;
}
var GIT_STATUS_LABELS = {
  "M": "已修改",
  "A": "已添加",
  "D": "已删除",
  "R": "已重命名",
  "C": "已复制",
  "U": "冲突",
  "?": "未跟踪",
  "!": "已忽略",
  " ": ""
};
function gitStatusLabel(entry) {
  const code = entry.staged ? entry.status[0] ?? " " : entry.status[1] ?? " ";
  return GIT_STATUS_LABELS[code] ?? (code === " " ? "未修改" : code);
}
var MAX_FILE_PREVIEW_BYTES = 512 * 1024;
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// packages/dsh-desktop-workbench/src/client.tsx
var PLUGIN_ID = "@wrddgg/dsh-desktop-workbench";
window.__ModuleLoader__?.load({
  id: PLUGIN_ID,
  factory: (require2) => {
    const React = require2("react");
    const primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
    const IconFolderOpenOutline16 = primitives?.IconFolderOpenOutline16;
    const IconBranchOutline16 = primitives?.IconBranchOutline16;
    const IconRefreshOutline16 = primitives?.IconRefreshOutline16;
    const styleId = "dsh-desktop-workbench-styles";
    const styles = `
      .dshWorkbenchTrigger{display:grid;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:7px;place-items:center;cursor:pointer}
      .dshWorkbenchTrigger:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshWorkbenchSide{display:flex;align-items:center;gap:7px;min-height:28px;padding:4px 10px;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:8px;font:600 12px/18px inherit;cursor:pointer}
      .dshWorkbenchSide:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshWorkbenchPanel{position:fixed;z-index:40;top:58px;right:18px;bottom:18px;width:min(680px,calc(100vw - 32px));min-width:380px;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-0);border:1px solid var(--dsw-alias-line-border);border-radius:16px;box-shadow:0 24px 70px rgba(10,30,60,.22);pointer-events:auto}
      .dshWorkbenchPanel__resize{position:absolute;top:16px;bottom:16px;left:-3px;width:7px;cursor:ew-resize}
      .dshWorkbenchPanel__header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchPanel__title{margin-right:8px;font-size:13px;font-weight:650;white-space:nowrap}
      .dshWorkbenchPanel__tab{display:flex;align-items:center;gap:6px;min-height:28px;padding:4px 10px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:8px;font:600 12px/18px inherit;cursor:pointer}
      .dshWorkbenchPanel__tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshWorkbenchPanel__tab[data-active="true"]{color:#4176e6;background:color-mix(in srgb,#4176e6 10%,transparent);border-color:color-mix(in srgb,#4176e6 22%,transparent)}
      .dshWorkbenchPanel__close{margin-left:auto;display:grid;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:7px;place-items:center;cursor:pointer}
      .dshWorkbenchPanel__close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshWorkbenchPanel__body{min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden}
      .dshWorkbenchPanel__footer{display:flex;align-items:center;gap:8px;padding:8px 14px;color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-line-border);font:11px/16px "Cascadia Mono",Consolas,monospace}
      .dshWorkbenchPanel__footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dshWorkbenchToolbar{display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchToolbar button,.dshWorkbenchRow button{min-height:26px;padding:3px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-line-border);border-radius:7px;font:600 11px/18px inherit;cursor:pointer}
      .dshWorkbenchToolbar button:hover,.dshWorkbenchRow button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .dshWorkbenchToolbar button:disabled,.dshWorkbenchRow button:disabled{cursor:default;opacity:.55}
      .dshWorkbenchCrumb{min-width:0;flex:1;overflow:hidden;color:var(--dsw-alias-label-secondary);font:11px/16px "Cascadia Mono",Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}
      .dshWorkbenchFiles{display:flex;min-height:0;flex:1}
      .dshWorkbenchList{width:46%;min-width:220px;overflow:auto;border-right:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchRow{display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 10px;cursor:pointer;font-size:12px}
      .dshWorkbenchRow:hover{background:var(--dsw-alias-bg-layer-1)}
      .dshWorkbenchRow__icon{flex:none;width:16px;text-align:center}
      .dshWorkbenchRow__name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dshWorkbenchRow__meta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}
      .dshWorkbenchRow__label{flex:none;min-width:52px;color:var(--dsw-alias-label-secondary);font-size:11px}
      .dshWorkbenchRow button{flex:none}
      .dshWorkbenchPreview{min-width:0;flex:1;overflow:auto}
      .dshWorkbenchPreview pre{margin:0;padding:12px 14px;font:12px/1.6 "Cascadia Mono",Consolas,monospace;white-space:pre-wrap;word-break:break-all}
      .dshWorkbenchNotice{padding:16px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .dshWorkbenchTerminal{display:flex;min-height:0;flex:1;flex-direction:column}
      .dshWorkbenchTerminal__output{min-height:0;flex:1;margin:0;padding:10px 14px;overflow:auto;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 55%,transparent);font:12px/1.55 "Cascadia Mono",Consolas,monospace;white-space:pre-wrap;word-break:break-all}
      .dshWorkbenchTerminal__input{display:flex;gap:8px;padding:8px 14px;border-top:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchTerminal__input input{min-width:0;flex:1;height:30px;padding:4px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:8px;font:12px/1.5 "Cascadia Mono",Consolas,monospace}
      .dshWorkbenchGit{display:flex;min-height:0;flex:1;flex-direction:column}
      .dshWorkbenchGit__diff{min-height:0;max-height:40%;flex:none;overflow:auto;border-top:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchGit__diff pre{margin:0;padding:10px 14px;font:11px/1.55 "Cascadia Mono",Consolas,monospace;white-space:pre-wrap;word-break:break-all}
      .dshWorkbenchGit__list{min-height:0;flex:1;overflow:auto}
      .dshWorkbenchGit__commit{display:flex;gap:8px;padding:8px 14px;border-top:1px solid var(--dsw-alias-line-border)}
      .dshWorkbenchGit__commit input{min-width:0;flex:1;height:30px;padding:4px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-line-border);border-radius:8px;font:12px/1.5 inherit}
      @media(max-width:760px){.dshWorkbenchPanel{top:12px;right:12px;bottom:12px;left:12px;width:auto;min-width:0}}
    `;
    function ensureStyles() {
      if (document.getElementById(styleId)) return;
      const tag = document.createElement("style");
      tag.id = styleId;
      tag.dataset.plugin = PLUGIN_ID;
      tag.textContent = styles;
      document.head.appendChild(tag);
    }
    const store = {
      open: false,
      tab: "files",
      cwd: void 0,
      listeners: /* @__PURE__ */ new Set(),
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      emit() {
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(snapshot);
      },
      snapshot() {
        return { open: this.open, tab: this.tab, cwd: this.cwd };
      },
      toggle(tab) {
        if (tab !== void 0) this.tab = tab;
        this.open = !this.open;
        this.emit();
      },
      openAt(tab) {
        this.tab = tab;
        this.open = true;
        this.emit();
      },
      close() {
        this.open = false;
        this.emit();
      },
      setCwd(cwd) {
        if (cwd !== void 0 && cwd !== this.cwd) {
          this.cwd = cwd;
          this.emit();
        }
      }
    };
    function resolveCwd(sessions) {
      const byId = sessions?.byId;
      if (byId === null || typeof byId !== "object") return void 0;
      if (sessions?.current === void 0) return void 0;
      const match = byId[sessions.current];
      if (match !== void 0 && typeof match.cwd === "string" && match.cwd.length > 0) return match.cwd;
      return void 0;
    }
    function apply(ctx) {
      const api = window.dshDesktop;
      if (!api) return;
      ensureStyles();
      function FilesTab() {
        const [dir, setDir] = React.useState(store.cwd);
        const [entries, setEntries] = React.useState(null);
        const [error, setError] = React.useState("");
        const [selected, setSelected] = React.useState(null);
        const load = React.useCallback(async (target) => {
          if (target === void 0) {
            setEntries(null);
            setError("未选择工作区：请打开一个会话，或点击「选择文件夹」。");
            return;
          }
          setEntries(null);
          setError("");
          const result = await api.fs.list(target);
          if (result?.ok === true && Array.isArray(result.entries)) {
            setEntries(result.entries);
            setDir(target);
          } else {
            setEntries([]);
            setError(result?.message ?? "读取目录失败");
          }
        }, []);
        React.useEffect(() => {
          void load(store.cwd);
        }, [store.cwd, load]);
        const openEntry = React.useCallback(async (entry) => {
          if (entry.isDirectory) {
            setSelected(null);
            void load(entry.path);
            return;
          }
          const result = await api.fs.read(entry.path, { maxBytes: MAX_FILE_PREVIEW_BYTES });
          if (result?.ok === true) {
            setSelected({ path: entry.path, content: result.content, binary: result.binary, truncated: result.truncated });
          } else {
            setSelected({ path: entry.path, error: result?.message ?? "读取文件失败" });
          }
        }, [load]);
        const pick = React.useCallback(async () => {
          const result = await api.dialog.pickDirectory();
          if (result?.ok === true && typeof result.path === "string") void load(result.path);
        }, [load]);
        const goUp = React.useCallback(() => {
          const parent = dir === void 0 ? void 0 : parentOf(dir);
          void load(parent);
        }, [dir, load]);
        return React.createElement(
          "div",
          { className: "dshWorkbenchFiles" },
          React.createElement(
            "div",
            { className: "dshWorkbenchList" },
            React.createElement(
              "div",
              { className: "dshWorkbenchToolbar" },
              React.createElement("button", { type: "button", onClick: goUp, title: "上一级", "aria-label": "上一级" }, "↑"),
              React.createElement("span", { className: "dshWorkbenchCrumb", title: dir }, dir ?? ""),
              React.createElement("button", { type: "button", onClick: () => void pick() }, "选择文件夹")
            ),
            error !== "" ? React.createElement("div", { className: "dshWorkbenchNotice" }, error) : null,
            entries === null ? React.createElement("div", { className: "dshWorkbenchNotice" }, "读取目录…") : null,
            (entries ?? []).map((entry) => React.createElement(
              "div",
              {
                key: entry.path,
                className: "dshWorkbenchRow",
                onClick: () => void openEntry(entry)
              },
              React.createElement("span", { className: "dshWorkbenchRow__icon" }, entry.isDirectory ? "📁" : "📄"),
              React.createElement("span", { className: "dshWorkbenchRow__name" }, entry.name),
              React.createElement("span", { className: "dshWorkbenchRow__meta" }, entry.isDirectory ? "" : formatBytes(entry.size))
            ))
          ),
          React.createElement(
            "div",
            { className: "dshWorkbenchPreview" },
            selected === null ? React.createElement("div", { className: "dshWorkbenchNotice" }, "点击左侧文件查看内容。") : React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "dshWorkbenchToolbar" },
                React.createElement("span", { className: "dshWorkbenchCrumb", title: selected.path }, basename(selected.path))
              ),
              selected.error !== void 0 ? React.createElement("div", { className: "dshWorkbenchNotice" }, selected.error) : selected.binary === true ? React.createElement("div", { className: "dshWorkbenchNotice" }, "二进制文件，无法预览。") : React.createElement(
                "pre",
                null,
                selected.content ?? "",
                selected.truncated === true ? "\n…（内容过长，已截断预览）" : ""
              )
            )
          )
        );
      }
      function TerminalTab() {
        const [available, setAvailable] = React.useState(void 0);
        const [sessionId, setSessionId] = React.useState(null);
        const [output, setOutput] = React.useState("");
        const [input, setInput] = React.useState("");
        const [busy, setBusy] = React.useState(false);
        const sessionRef = React.useRef(null);
        const outputRef = React.useRef(null);
        React.useEffect(() => {
          void api.pty.available().then((value) => setAvailable(value));
          const offData = api.pty.onData((id, data) => {
            if (sessionRef.current !== id) return;
            setOutput((previous) => previous + data);
          });
          const offExit = api.pty.onExit((id, code) => {
            if (sessionRef.current !== id) return;
            sessionRef.current = null;
            setSessionId(null);
            setOutput((previous) => `${previous}
[终端已退出，代码 ${code}]`);
          });
          return () => {
            offData();
            offExit();
          };
        }, []);
        React.useEffect(() => {
          const element = outputRef.current;
          if (element !== null) element.scrollTop = element.scrollHeight;
        }, [output]);
        const start = React.useCallback(async () => {
          setBusy(true);
          try {
            const result = await api.pty.create({ cwd: store.cwd });
            if (result?.ok === true) {
              sessionRef.current = result.id;
              setSessionId(result.id);
              setOutput("");
            } else {
              setOutput(`[启动终端失败：${result?.message ?? "未知错误"}]`);
            }
          } finally {
            setBusy(false);
          }
        }, []);
        const kill = React.useCallback(async () => {
          const id = sessionRef.current;
          if (id === null) return;
          await api.pty.kill(id);
        }, []);
        const send = React.useCallback(() => {
          const id = sessionRef.current;
          if (id === null || input === "") return;
          void api.pty.write(id, `${input}\r`);
          setInput("");
        }, [input]);
        return React.createElement(
          "div",
          { className: "dshWorkbenchTerminal" },
          React.createElement(
            "div",
            { className: "dshWorkbenchToolbar" },
            sessionId === null ? React.createElement("button", { type: "button", disabled: busy || available !== true, onClick: () => void start() }, "启动终端") : React.createElement("button", { type: "button", onClick: () => void kill() }, "关闭终端"),
            React.createElement("span", { className: "dshWorkbenchCrumb" }, sessionId !== null ? `会话 ${sessionId}` : available === false ? "终端组件不可用" : "在工作区目录中启动 cmd.exe")
          ),
          React.createElement(
            "pre",
            { className: "dshWorkbenchTerminal__output", ref: outputRef },
            output === "" ? "（终端输出将显示在这里）" : stripAnsi(output)
          ),
          React.createElement(
            "div",
            { className: "dshWorkbenchTerminal__input" },
            React.createElement("input", {
              value: input,
              disabled: sessionId === null,
              placeholder: sessionId === null ? "先启动终端" : "输入命令，回车执行",
              onChange: (event) => setInput(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") send();
              }
            }),
            React.createElement("button", { type: "button", disabled: sessionId === null || input === "", onClick: send }, "执行")
          )
        );
      }
      function GitTab() {
        const [status, setStatus] = React.useState(null);
        const [diff, setDiff] = React.useState(null);
        const [message, setMessage] = React.useState("");
        const [busy, setBusy] = React.useState(false);
        const refresh = React.useCallback(async () => {
          if (store.cwd === void 0) {
            setStatus({ ok: false, message: "未选择工作区" });
            return;
          }
          const result = await api.git.status(store.cwd);
          setStatus(result);
        }, []);
        React.useEffect(() => {
          void refresh();
        }, [store.cwd, refresh]);
        const act = React.useCallback(async (task) => {
          setBusy(true);
          try {
            await task();
          } finally {
            setBusy(false);
            void refresh();
          }
        }, [refresh]);
        const showDiff = React.useCallback(async (entry) => {
          const result = await api.git.diff(store.cwd, { path: entry.path, staged: entry.staged });
          setDiff({ path: entry.path, text: result?.ok === true ? result.text : result?.message ?? "读取差异失败" });
        }, []);
        const commit = React.useCallback(() => {
          void act(async () => {
            const result = await api.git.commit(store.cwd, message);
            if (result?.ok === true) setMessage("");
          });
        }, [act, message]);
        const entries = status?.ok === true ? status.entries ?? [] : [];
        return React.createElement(
          "div",
          { className: "dshWorkbenchGit" },
          React.createElement(
            "div",
            { className: "dshWorkbenchToolbar" },
            React.createElement("span", { className: "dshWorkbenchCrumb" }, `分支：${status?.branch ?? "—"}`),
            React.createElement(
              "button",
              { type: "button", disabled: busy, onClick: () => void refresh(), title: "刷新", "aria-label": "刷新" },
              IconRefreshOutline16 ? React.createElement(IconRefreshOutline16, { size: 14 }) : "刷新"
            )
          ),
          status?.ok !== true ? React.createElement("div", { className: "dshWorkbenchNotice" }, status?.message ?? "读取 git 状态…（当前目录不是 git 仓库时请先选择工作区）") : entries.length === 0 ? React.createElement("div", { className: "dshWorkbenchNotice" }, "工作区干净，没有未提交的改动。") : React.createElement(
            "div",
            { className: "dshWorkbenchGit__list" },
            entries.map((entry) => React.createElement(
              "div",
              {
                key: `${entry.staged ? "s" : "u"}:${entry.path}`,
                className: "dshWorkbenchRow"
              },
              React.createElement("span", { className: "dshWorkbenchRow__label" }, entry.staged ? "已暂存" : gitStatusLabel(entry)),
              React.createElement("span", { className: "dshWorkbenchRow__name", title: entry.path }, entry.path),
              entry.staged ? React.createElement("button", { type: "button", disabled: busy, onClick: () => void act(() => api.git.unstage(store.cwd, [entry.path])) }, "取消暂存") : React.createElement("button", { type: "button", disabled: busy, onClick: () => void act(() => api.git.stage(store.cwd, [entry.path])) }, "暂存"),
              React.createElement("button", { type: "button", disabled: busy, onClick: () => void showDiff(entry) }, "差异")
            ))
          ),
          diff !== null ? React.createElement(
            "div",
            { className: "dshWorkbenchGit__diff" },
            React.createElement(
              "div",
              { className: "dshWorkbenchToolbar" },
              React.createElement("span", { className: "dshWorkbenchCrumb", title: diff.path }, basename(diff.path)),
              React.createElement("button", { type: "button", onClick: () => setDiff(null) }, "关闭")
            ),
            React.createElement("pre", null, diff.text)
          ) : null,
          React.createElement(
            "div",
            { className: "dshWorkbenchGit__commit" },
            React.createElement("input", {
              value: message,
              placeholder: "提交信息（仅提交已暂存的改动）",
              onChange: (event) => setMessage(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") commit();
              }
            }),
            React.createElement("button", { type: "button", disabled: busy || message.trim() === "", onClick: commit }, "提交")
          )
        );
      }
      function WorkbenchPanel() {
        const [snapshot, setSnapshot] = React.useState(store.snapshot());
        React.useEffect(() => store.subscribe(setSnapshot), []);
        if (!snapshot.open) return null;
        const resize = (event) => {
          event.preventDefault();
          const startX = event.clientX;
          const panel = event.currentTarget.parentElement;
          const startWidth = panel?.getBoundingClientRect().width ?? 680;
          const move = (nextEvent) => {
            const next = Math.max(380, Math.min(900, startWidth + startX - nextEvent.clientX));
            if (panel !== null) panel.style.width = `${next}px`;
          };
          const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop, { once: true });
        };
        const tabs = [
          { id: "files", label: "文件", icon: IconFolderOpenOutline16, glyph: null },
          { id: "git", label: "Git", icon: IconBranchOutline16, glyph: null },
          { id: "terminal", label: "终端", icon: null, glyph: ">_" }
        ];
        return React.createElement(
          "aside",
          { className: "dshWorkbenchPanel", role: "dialog", "aria-label": "工作台" },
          React.createElement("span", { className: "dshWorkbenchPanel__resize", onPointerDown: resize, "aria-hidden": "true" }),
          React.createElement(
            "header",
            { className: "dshWorkbenchPanel__header" },
            React.createElement("span", { className: "dshWorkbenchPanel__title" }, "工作台"),
            tabs.map((tab) => React.createElement("button", {
              key: tab.id,
              type: "button",
              className: "dshWorkbenchPanel__tab",
              "data-active": snapshot.tab === tab.id ? "true" : "false",
              onClick: () => store.openAt(tab.id)
            }, tab.icon ? React.createElement(tab.icon, { size: 15 }) : tab.glyph, tab.label)),
            React.createElement("button", { type: "button", className: "dshWorkbenchPanel__close", onClick: () => store.close(), "aria-label": "关闭工作台" }, "×")
          ),
          React.createElement(
            "div",
            { className: "dshWorkbenchPanel__body" },
            snapshot.tab === "files" ? React.createElement(FilesTab) : snapshot.tab === "git" ? React.createElement(GitTab) : React.createElement(TerminalTab)
          ),
          React.createElement(
            "footer",
            { className: "dshWorkbenchPanel__footer" },
            React.createElement("span", null, snapshot.cwd ?? "未绑定工作区")
          )
        );
      }
      function ComposerTrigger(props) {
        ensureStyles();
        React.useEffect(() => {
          const sessions = typeof props?.useSessions === "function" ? props.useSessions() : void 0;
          store.setCwd(resolveCwd(sessions));
        });
        return React.createElement("button", {
          type: "button",
          className: "dshWorkbenchTrigger",
          title: "工作台（文件 / Git / 终端）",
          "aria-label": "打开工作台",
          onClick: () => store.toggle()
        }, IconFolderOpenOutline16 ? React.createElement(IconFolderOpenOutline16, { size: 16 }) : "▦");
      }
      function SidebarTrigger(props) {
        ensureStyles();
        React.useEffect(() => {
          const sessions = typeof props?.useSessions === "function" ? props.useSessions() : void 0;
          store.setCwd(resolveCwd(sessions));
        });
        if (props?.wide !== true) return null;
        return React.createElement("button", {
          type: "button",
          className: "dshWorkbenchSide",
          onClick: () => store.toggle()
        }, IconFolderOpenOutline16 ? React.createElement(IconFolderOpenOutline16, { size: 15 }) : null, "工作台");
      }
      try {
        ctx.slots.inject("shell.overlay", function* () {
          yield ctx.slots.register({ name: "shell.overlay", id: "desktop-workbench", order: 70 }, WorkbenchPanel);
        });
      } catch (error) {
        console.warn("[dsh-desktop-workbench] overlay slot unavailable", error);
      }
      try {
        ctx.slots.inject("conversation.input.right", function* () {
          yield ctx.slots.register({ name: "conversation.input.right", id: "desktop-workbench-trigger", order: 40, label: "工作台" }, ComposerTrigger);
        });
      } catch (error) {
        console.warn("[dsh-desktop-workbench] composer slot unavailable", error);
      }
      try {
        ctx.slots.inject("sidebar.footer.action", function* () {
          yield ctx.slots.register({ name: "sidebar.footer.action", id: "desktop-workbench-side", order: 70, label: "工作台" }, SidebarTrigger);
        });
      } catch (error) {
        console.warn("[dsh-desktop-workbench] sidebar slot unavailable", error);
      }
    }
    return { apply, inject: ["slots", "sessions"] };
  }
});
