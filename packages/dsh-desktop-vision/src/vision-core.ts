/** Small pure helpers for the DSH Desktop vision plugin (duplicated from the
 * file-ref plugin's core to stay within each client bundle's module table). */

export interface CapEntry {
  provider: string
  model: string
  modalities: string[]
}

export function displayBasename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function quotePath(path: string): string {
  return `"${path}"`
}

/** A model supports image input only when its declared entry says so. */
export function modelSupportsImages(entries: readonly CapEntry[], provider: string, model: string): boolean {
  const entry = entries.find(cap => cap.provider === provider && cap.model === model)
  return entry !== undefined && entry.modalities.includes('image')
}
