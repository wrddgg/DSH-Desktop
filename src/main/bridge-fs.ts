import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type {
  FsEntry,
  FsListResult,
  FsReadResult,
  FsSearchEntry,
  FsSearchResult,
  FsStatResult,
} from '../shared/contracts.js'

const SEARCH_MAX_DEPTH = 14
const SEARCH_MAX_DIRS = 2500
const SEARCH_DEADLINE_MS = 3000
const SEARCH_DEFAULT_LIMIT = 20
const SEARCH_MAX_LIMIT = 100
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build', 'coverage', '.cache'])

function isBinary(buffer: Buffer): boolean {
  const window = buffer.subarray(0, 8192)
  for (const byte of window) {
    if (byte === 0) return true
  }
  return false
}

function joinNormalized(a: string, b: string): string {
  return a.endsWith(sep) || a.endsWith('/') ? `${a}${b}` : `${a}${sep}${b}`
}

/**
 * Filesystem bridge for the DSH page: stat/list/read/write plus a bounded
 * fuzzy filename search. All operations are user-initiated from the trusted
 * DSH page (IPC sender validation lives in ipc.ts), so paths are accepted
 * as-is — this bridge is a native seam, not a security boundary.
 */
export class FsBridge {
  readonly #fallbackRoot: string
  readonly #log: (scope: string, message: string) => void

  public constructor(options: { fallbackRoot: string; log: (scope: string, message: string) => void }) {
    this.#fallbackRoot = options.fallbackRoot
    this.#log = options.log
  }

  public async statPath(path: string): Promise<FsStatResult> {
    try {
      const info = await stat(path)
      return { ok: true, exists: true, isDirectory: info.isDirectory(), size: info.size }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: true, exists: false }
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async list(directory: string): Promise<FsListResult> {
    try {
      const names = await readdir(directory, { withFileTypes: true })
      const entries: FsEntry[] = []
      for (const entry of names) {
        const path = joinNormalized(directory, entry.name)
        try {
          const info = entry.isDirectory() || entry.isSymbolicLink() ? await stat(path) : null
          const isDirectory = info !== null ? info.isDirectory() : entry.isDirectory()
          entries.push({
            name: entry.name,
            path,
            isDirectory,
            size: isDirectory ? 0 : (info ?? { size: 0 }).size,
          })
        } catch {
          entries.push({ name: entry.name, path, isDirectory: entry.isDirectory(), size: 0 })
        }
      }
      entries.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
      return { ok: true, entries }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async read(path: string, options?: { maxBytes?: number }): Promise<FsReadResult> {
    const maxBytes = options?.maxBytes ?? 1024 * 1024
    try {
      const buffer = await readFile(path)
      const truncated = buffer.length > maxBytes
      const window = truncated ? buffer.subarray(0, maxBytes) : buffer
      const binary = isBinary(window)
      const content = binary ? undefined : window.toString('utf8')
      return content === undefined
        ? { ok: true, binary, truncated }
        : { ok: true, content, binary, truncated }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async write(path: string, content: string): Promise<{ ok: boolean; message?: string }> {
    try {
      await writeFile(path, content, 'utf8')
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async search(query: string, options?: { root?: string; limit?: number }): Promise<FsSearchResult> {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return { ok: true, entries: [] }
    const limit = Math.min(Math.max(options?.limit ?? SEARCH_DEFAULT_LIMIT, 1), SEARCH_MAX_LIMIT)

    const root = this.#resolveSearchRoot(query, options?.root)
    const started = Date.now()
    const results: FsSearchEntry[] = []
    const queue: string[] = [root]
    let visitedDirs = 0

    try {
      while (queue.length > 0 && results.length < limit && visitedDirs < SEARCH_MAX_DIRS) {
        if (Date.now() - started > SEARCH_DEADLINE_MS) break
        const current = queue.shift()
        if (current === undefined) break
        const depth = this.#depthOf(root, current)
        if (depth > SEARCH_MAX_DEPTH) continue
        visitedDirs += 1

        let names
        try {
          names = await readdir(current, { withFileTypes: true })
        } catch {
          continue
        }

        for (const entry of names) {
          if (Date.now() - started > SEARCH_DEADLINE_MS || results.length >= limit) break
          const name = entry.name.toLowerCase()
          if (!name.includes(needle) && !name.startsWith(needle)) {
            if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
              queue.push(joinNormalized(current, entry.name))
            }
            continue
          }
          const path = joinNormalized(current, entry.name)
          try {
            const info = await stat(path)
            const isDirectory = info.isDirectory()
            results.push({ path, isDirectory, size: isDirectory ? 0 : info.size })
            if (isDirectory && !SKIPPED_DIRECTORIES.has(entry.name)) queue.push(path)
          } catch {
            results.push({ path, isDirectory: entry.isDirectory(), size: 0 })
          }
        }
      }
      return { ok: true, entries: results.slice(0, limit) }
    } catch (error) {
      void this.#log('fs:error', error instanceof Error ? error.message : String(error))
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  #resolveSearchRoot(query: string, root: string | undefined): string {
    if (typeof root === 'string' && root.length > 0 && isAbsolute(root)) return resolve(root)
    const trimmed = query.trim()
    const separatorIndex = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
    if (separatorIndex > 0) {
      const prefix = trimmed.slice(0, separatorIndex)
      const candidate = isAbsolute(prefix) ? resolve(prefix) : resolve(this.#fallbackRoot, prefix)
      return candidate
    }
    if (separatorIndex === 0) return resolve(trimmed.slice(0, separatorIndex + 1))
    return resolve(this.#fallbackRoot)
  }

  #depthOf(root: string, current: string): number {
    const relative = current.slice(root.length)
    const parts = relative.split(/[\\/]/).filter(part => part.length > 0)
    return parts.length
  }
}
