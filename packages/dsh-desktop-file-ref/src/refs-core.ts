/**
 * Pure logic for the DSH Desktop file-reference plugin: classification,
 * reference serialization, and small-file inlining decisions. No DOM, no
 * browser globals, no plugin runtime — unit-testable under plain Node.
 * @module refs-core
 */

export const MAX_REF_COUNT = 20
export const MAX_INLINE_BYTES = 8 * 1024
export const DEFAULT_SEARCH_LIMIT = 20

export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif',
])

export interface DroppedFileLike {
  name: string
  type: string
}

export interface ReadLikeResult {
  ok: boolean
  binary?: boolean
  truncated?: boolean
  content?: string
}

export interface StatLikeResult {
  ok: boolean
  exists?: boolean
  isDirectory?: boolean
  size?: number
}

export interface FileRefShape {
  path: string
  kind: 'file' | 'dir'
  size?: number
  readonly?: boolean
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  if (index < 0) return ''
  return name.slice(index + 1).toLowerCase()
}

export function isImageFile(file: DroppedFileLike): boolean {
  const type = (file.type ?? '').toLowerCase()
  if (type.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(extensionOf(file.name ?? ''))
}

export function classifyFiles(files: readonly DroppedFileLike[]): {
  images: DroppedFileLike[]
  others: DroppedFileLike[]
} {
  const images: DroppedFileLike[] = []
  const others: DroppedFileLike[] = []
  for (const file of files) (isImageFile(file) ? images : others).push(file)
  return { images, others }
}

export function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function displayBasename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

/** Clipboard projection: a quoted path, safe to paste into shells or prose. */
export function quotePath(path: string): string {
  return `"${path}"`
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Decide whether `path` lives inside `root` (both normalized to plain
 * strings). Unknown root → false (callers skip the readonly badge).
 */
export function isInsideRoot(path: string, root: string | undefined): boolean {
  if (!root) return false
  const normalized = path.replaceAll('/', '\\')
  const rootNormalized = root.replace(/[\\/]+$/, '').replaceAll('/', '\\')
  if (normalized === rootNormalized) return true
  return normalized.toLowerCase().startsWith(`${rootNormalized.toLowerCase()}\\`)
}

/**
 * Serialize one file reference for the model (the ReferenceCodec contract).
 * Default = path-only reference (Codex semantics) + a short reading
 * instruction; small text files are inlined, bounded by MAX_INLINE_BYTES.
 * Missing files throw — the codec contract blocks the send instead of
 * silently downgrading.
 */
export async function serializeFileRef(
  ref: FileRefShape,
  read: (path: string, maxBytes: number) => Promise<ReadLikeResult>,
): Promise<string> {
  const escaped = xmlEscape(ref.path)
  const attributes: string[] = []
  if (ref.readonly) attributes.push('readonly="true"')
  if (ref.size !== undefined) attributes.push(`size="${ref.size}"`)
  const attributeText = attributes.length > 0 ? ` ${attributes.join(' ')}` : ''

  if (ref.kind === 'dir') {
    return `<file-ref kind="dir" path="${escaped}"${attributeText}/>\n请先列出该目录的内容，再按需读取其中的文件。`
  }

  const size = ref.size ?? Number.POSITIVE_INFINITY
  if (size <= MAX_INLINE_BYTES) {
    const result = await read(ref.path, MAX_INLINE_BYTES)
    if (!result.ok) {
      throw new Error(`无法读取引用文件：${ref.path}`)
    }
    if (result.binary) {
      return `<file-ref kind="file" path="${escaped}"${attributeText} binary="true"/>\n该文件是二进制文件，请使用文件读取工具按需读取。`
    }
    if (!result.truncated) {
      return `<file-ref kind="file" path="${escaped}"${attributeText}>\n${result.content ?? ''}\n</file-ref>`
    }
  }
  return `<file-ref kind="file" path="${escaped}"${attributeText}/>\n请使用文件读取工具读取该文件的内容。`
}
