/**
 * Pure logic for the DSH Desktop Workbench plugin: terminal ANSI stripping,
 * path helpers, and git status-code labels. No DOM, no browser globals —
 * unit-testable under plain Node.
 * @module workbench-core
 */

/** Strip CSI/OSC escape sequences and common SGR codes from terminal output. */
export function stripAnsi(text: string): string {
  // CSI sequences: ESC [ ... (params/inters/finals) with limited charset.
  // OSC sequences: ESC ] ... (BEL or ST).
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-9;:?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
}

export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  return parent.endsWith('\\') || parent.endsWith('/') ? `${parent}${name}` : `${parent}${separator}${name}`
}

export function parentOf(path: string): string | undefined {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (index < 0) return undefined
  const parent = trimmed.slice(0, index)
  if (parent.length === 0) return undefined
  // A drive-letter root (C:) has no navigable parent.
  if (/^[A-Za-z]:$/.test(parent)) return undefined
  return parent
}

const GIT_STATUS_LABELS: Record<string, string> = {
  'M': '已修改',
  'A': '已添加',
  'D': '已删除',
  'R': '已重命名',
  'C': '已复制',
  'U': '冲突',
  '?': '未跟踪',
  '!': '已忽略',
  ' ': '',
}

export interface GitStatusLike {
  path: string
  status: string
  staged: boolean
}

/** Human label for a git porcelain XY code (staged-aware). */
export function gitStatusLabel(entry: GitStatusLike): string {
  const code = entry.staged
    ? entry.status[0] ?? ' '
    : entry.status[1] ?? ' '
  return GIT_STATUS_LABELS[code] ?? (code === ' ' ? '未修改' : code)
}

export const MAX_FILE_PREVIEW_BYTES = 512 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
