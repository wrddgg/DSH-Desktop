"use strict";

// packages/dsh-desktop-file-ref/src/refs-core.ts
var MAX_REF_COUNT = 20;
var MAX_INLINE_BYTES = 8 * 1024;
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif"
]);
function extensionOf(name) {
  const index = name.lastIndexOf(".");
  if (index < 0) return "";
  return name.slice(index + 1).toLowerCase();
}
function isImageFile(file) {
  const type = (file.type ?? "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(file.name ?? ""));
}
function classifyFiles(files) {
  const images = [];
  const others = [];
  for (const file of files) (isImageFile(file) ? images : others).push(file);
  return { images, others };
}
function xmlEscape(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function displayBasename(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
function quotePath(path) {
  return `"${path}"`;
}
function formatSize(bytes) {
  if (bytes === void 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isInsideRoot(path, root) {
  if (!root) return false;
  const normalized = path.replaceAll("/", "\\");
  const rootNormalized = root.replace(/[\\/]+$/, "").replaceAll("/", "\\");
  if (normalized === rootNormalized) return true;
  return normalized.toLowerCase().startsWith(`${rootNormalized.toLowerCase()}\\`);
}
async function serializeFileRef(ref, read) {
  const escaped = xmlEscape(ref.path);
  const attributes = [];
  if (ref.readonly) attributes.push('readonly="true"');
  if (ref.size !== void 0) attributes.push(`size="${ref.size}"`);
  const attributeText = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  if (ref.kind === "dir") {
    return `<file-ref kind="dir" path="${escaped}"${attributeText}/>
\u8BF7\u5148\u5217\u51FA\u8BE5\u76EE\u5F55\u7684\u5185\u5BB9\uFF0C\u518D\u6309\u9700\u8BFB\u53D6\u5176\u4E2D\u7684\u6587\u4EF6\u3002`;
  }
  const size = ref.size ?? Number.POSITIVE_INFINITY;
  if (size <= MAX_INLINE_BYTES) {
    const result = await read(ref.path, MAX_INLINE_BYTES);
    if (!result.ok) {
      throw new Error(`\u65E0\u6CD5\u8BFB\u53D6\u5F15\u7528\u6587\u4EF6\uFF1A${ref.path}`);
    }
    if (result.binary) {
      return `<file-ref kind="file" path="${escaped}"${attributeText} binary="true"/>
\u8BE5\u6587\u4EF6\u662F\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u8BF7\u4F7F\u7528\u6587\u4EF6\u8BFB\u53D6\u5DE5\u5177\u6309\u9700\u8BFB\u53D6\u3002`;
    }
    if (!result.truncated) {
      return `<file-ref kind="file" path="${escaped}"${attributeText}>
${result.content ?? ""}
</file-ref>`;
    }
  }
  return `<file-ref kind="file" path="${escaped}"${attributeText}/>
\u8BF7\u4F7F\u7528\u6587\u4EF6\u8BFB\u53D6\u5DE5\u5177\u8BFB\u53D6\u8BE5\u6587\u4EF6\u7684\u5185\u5BB9\u3002`;
}

// packages/dsh-desktop-file-ref/src/client.tsx
var PLUGIN_ID = "@wrddgg/dsh-desktop-file-ref";
var SOURCE_NAME = "workspace-files";
window.__ModuleLoader__?.load({
  id: PLUGIN_ID,
  factory: (require2) => {
    const React = require2("react");
    const { DropOverlay } = require2("@deepseek-ai/dsh-client-ui-attachment");
    const primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
    const IconPaperclipOutline16 = primitives?.IconPaperclipOutline16;
    const styleId = "dsh-desktop-file-ref-styles";
    const styles = `
      .dshFileRefAttach{display:grid;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:7px;place-items:center;cursor:pointer}
      .dshFileRefAttach:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
      .dshFileRefAttach:focus-visible{outline:3px solid color-mix(in srgb,#4176e6 35%,transparent);outline-offset:2px}
      .dshFileRefAttach:disabled{cursor:default;opacity:.5}
      .dshFileRefOverlay{z-index:60;pointer-events:none}
    `;
    function ensureStyles() {
      if (document.getElementById(styleId)) return;
      const tag = document.createElement("style");
      tag.id = styleId;
      tag.dataset.plugin = PLUGIN_ID;
      tag.textContent = styles;
      document.head.appendChild(tag);
    }
    const rootState = { current: void 0 };
    function readCaret(draft) {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" && el.type === "text")) {
        const start = el.selectionStart;
        if (typeof start === "number" && start <= draft.length) return start;
      }
      return draft.length;
    }
    function isAcceptableDrop(files) {
      return files.length > 0 && files.length <= MAX_REF_COUNT;
    }
    function apply(ctx) {
      const api = window.dshDesktop;
      if (!api) return;
      ensureStyles();
      const source = {
        trigger: "@",
        name: SOURCE_NAME,
        order: 10,
        async candidates(_session, req) {
          const query = (req.query ?? "").trim();
          if (query.length === 0) return [];
          try {
            const result = await api.fs.search(query, { root: rootState.current ?? void 0, limit: 20 });
            if (!result || result.ok !== true || !Array.isArray(result.entries)) return [];
            return result.entries.map((entry) => ({
              name: entry.path,
              description: entry.isDirectory ? "\u6587\u4EF6\u5939" : `\u6587\u4EF6 \xB7 ${formatSize(entry.size)}`,
              icon: entry.isDirectory ? "\u{1F4C1}" : "\u{1F4C4}"
            }));
          } catch {
            return [];
          }
        },
        onPick(pick) {
          const path = pick.candidate.name;
          return {
            insert: {
              source: SOURCE_NAME,
              ref: path,
              label: displayBasename(path),
              clipboardText: quotePath(path)
            }
          };
        },
        codec: {
          clipboardText(ref) {
            return quotePath(ref);
          },
          async serialize(ref) {
            const stat = await api.fs.stat(ref);
            if (!stat || stat.ok !== true || stat.exists !== true) {
              throw new Error(`\u5F15\u7528\u7684\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u65E0\u6CD5\u8BBF\u95EE\uFF1A${ref}`);
            }
            return serializeFileRef(
              {
                path: ref,
                kind: stat.isDirectory ? "dir" : "file",
                size: stat.size,
                readonly: !isInsideRoot(ref, rootState.current)
              },
              (path, maxBytes) => api.fs.read(path, { maxBytes })
            );
          }
        }
      };
      let sourceRegistered = false;
      const registerSource = () => {
        if (sourceRegistered) return;
        const service = ctx.get?.("inputTriggers");
        if (!service?.registerSource) return;
        try {
          service.registerSource(source);
          sourceRegistered = true;
        } catch (error) {
          console.warn("[dsh-desktop-file-ref] registerSource failed", error);
        }
      };
      registerSource();
      function AttachAction(props) {
        ensureStyles();
        const sessionId = props?.sessionId;
        const session = props?.session;
        const input = props?.input;
        const sessions = typeof props?.useSessions === "function" ? props.useSessions() : void 0;
        const [busy, setBusy] = React.useState(false);
        const root = resolveRoot(sessionId, session, sessions);
        if (root) rootState.current = root;
        const inputRef = React.useRef({ draft: "", draftRev: 0 });
        inputRef.current = { draft: input?.draft ?? "", draftRev: input?.draftRev ?? 0 };
        const sessionRef = React.useRef(sessionId);
        sessionRef.current = sessionId;
        const insertRefs = React.useCallback((paths) => {
          const id = sessionRef.current;
          if (!id) return false;
          const actx = ctx.sessions?.scope?.(id);
          if (!actx) return false;
          let state = inputRef.current;
          let caret = readCaret(state.draft);
          let rev = state.draftRev;
          let appliedAny = false;
          for (const path of paths.slice(0, MAX_REF_COUNT)) {
            const reference = {
              source: SOURCE_NAME,
              ref: path,
              label: displayBasename(path),
              clipboardText: quotePath(path)
            };
            let applied = false;
            try {
              applied = actx.bail(actx, "slash/input-insert-reference", {
                reference,
                span: { start: caret, end: caret, draftRev: rev }
              }) === true;
            } catch {
              applied = false;
            }
            if (!applied) {
              try {
                const latest = inputRef.current;
                applied = actx.bail(actx, "slash/input-insert-text", {
                  text: quotePath(path),
                  span: { start: latest.draft.length, end: latest.draft.length, draftRev: latest.draftRev }
                }) === true;
              } catch {
                applied = false;
              }
            }
            if (!applied) break;
            appliedAny = true;
            caret += 1;
            rev += 1;
          }
          return appliedAny;
        }, []);
        const [dropState, setDropState] = React.useState({ active: false, count: 0, hasNonImage: false, canAccept: true });
        const dropRef = React.useRef(dropState);
        dropRef.current = dropState;
        React.useEffect(() => {
          let depth = 0;
          const filesOf = (event) => {
            const transfer = event.dataTransfer;
            if (!transfer || !Array.from(transfer.types).includes("Files")) return [];
            return [...transfer.files ?? []];
          };
          const update = (files, active) => {
            const { images, others } = classifyFiles(files);
            setDropState({
              active,
              count: files.length,
              hasNonImage: others.length > 0,
              canAccept: Boolean(sessionRef.current) && isAcceptableDrop(files)
            });
          };
          const onDragEnter = (event) => {
            const files = filesOf(event);
            if (files.length === 0) return;
            depth += 1;
            update(files, true);
          };
          const onDragOver = (event) => {
            if (filesOf(event).length === 0) return;
            update(filesOf(event), true);
          };
          const onDragLeave = (event) => {
            if (filesOf(event).length === 0) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDropState((prev) => ({ ...prev, active: false }));
          };
          const onDrop = (event) => {
            if (window.__dshFileRefSynthetic === true) return;
            const files = filesOf(event);
            if (files.length === 0) return;
            depth = 0;
            setDropState((prev) => ({ ...prev, active: false }));
            const { images, others } = classifyFiles(files);
            if (others.length === 0) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const paths = others.map((file) => pathOf(file)).filter((path) => typeof path === "string" && path.length > 0);
            if (paths.length > 0) insertRefs(paths);
            if (images.length > 0) {
              try {
                const transfer = new DataTransfer();
                for (const file of images) transfer.items.add(file);
                window.__dshFileRefSynthetic = true;
                document.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
                window.__dshFileRefSynthetic = false;
              } catch {
                ;
                window.__dshFileRefSynthetic = false;
              }
            }
          };
          const onDragEnd = () => {
            depth = 0;
            setDropState((prev) => ({ ...prev, active: false }));
          };
          document.addEventListener("dragenter", onDragEnter, true);
          document.addEventListener("dragover", onDragOver, true);
          document.addEventListener("dragleave", onDragLeave, true);
          document.addEventListener("drop", onDrop, true);
          window.addEventListener("dragend", onDragEnd);
          return () => {
            document.removeEventListener("dragenter", onDragEnter, true);
            document.removeEventListener("dragover", onDragOver, true);
            document.removeEventListener("dragleave", onDragLeave, true);
            document.removeEventListener("drop", onDrop, true);
            window.removeEventListener("dragend", onDragEnd);
          };
        }, [insertRefs]);
        const pickFiles = React.useCallback(async () => {
          setBusy(true);
          try {
            const result = await api.dialog.pickFiles();
            if (result?.ok === true && Array.isArray(result.paths) && result.paths.length > 0) {
              insertRefs(result.paths);
            }
          } finally {
            setBusy(false);
          }
        }, [insertRefs]);
        const overlay = dropState.active && dropState.hasNonImage ? React.createElement(DropOverlay, {
          disabled: !dropState.canAccept,
          labels: {
            title: dropState.canAccept ? `\u677E\u5F00\u4EE5\u5F15\u7528 ${dropState.count} \u4E2A\u6587\u4EF6` : "\u5F53\u524D\u65E0\u6CD5\u63A5\u6536\u6587\u4EF6\u5F15\u7528",
            desc: dropState.canAccept ? "\u56FE\u7247\u4ECD\u4F5C\u4E3A\u9644\u4EF6\u53D1\u9001\uFF1B\u6587\u4EF6\u4EE5\u8DEF\u5F84\u5F15\u7528\u4EA4\u7ED9\u6A21\u578B\u8BFB\u53D6" : void 0
          }
        }) : null;
        const attachButton = React.createElement("button", {
          type: "button",
          className: "dshFileRefAttach",
          disabled: busy || !sessionRef.current,
          title: "\u5F15\u7528\u6587\u4EF6\uFF08\u4E5F\u53EF\u4EE5\u628A\u6587\u4EF6\u62D6\u8FDB\u5BF9\u8BDD\u533A\uFF09",
          "aria-label": "\u5F15\u7528\u6587\u4EF6",
          onClick: () => void pickFiles()
        }, IconPaperclipOutline16 ? React.createElement(IconPaperclipOutline16, { size: 16 }) : "\u{1F4CE}");
        return React.createElement(React.Fragment, null, attachButton, overlay);
      }
      try {
        ctx.slots.inject("conversation.input.left", function* () {
          yield ctx.slots.register(
            { name: "conversation.input.left", id: "desktop-file-ref-attach", order: 35, label: "\u5F15\u7528\u6587\u4EF6" },
            AttachAction
          );
        });
      } catch (error) {
        console.warn("[dsh-desktop-file-ref] composer slot unavailable", error);
      }
    }
    function resolveRoot(sessionId, session, sessions) {
      const direct = session?.header?.cwd ?? session?.cwd;
      if (typeof direct === "string" && direct.length > 0) return direct;
      const byId = sessions?.byId;
      if (byId !== null && typeof byId === "object") {
        const match = (sessionId !== void 0 ? byId[sessionId] : void 0) ?? (sessions?.current !== void 0 ? byId[sessions.current] : void 0);
        if (match !== void 0 && typeof match.cwd === "string" && match.cwd.length > 0) return match.cwd;
      }
      return void 0;
    }
    function pathOf(file) {
      try {
        if (typeof window.dshDesktop?.getPathForFile === "function") {
          return window.dshDesktop.getPathForFile(file) ?? "";
        }
      } catch {
      }
      return typeof file.path === "string" ? file.path : "";
    }
    return { apply, inject: [] };
  }
});
