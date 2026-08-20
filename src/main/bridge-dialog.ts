import { dialog, type BrowserWindow } from 'electron'
import type {
  DialogPickDirectoryResult,
  DialogPickFilesResult,
} from '../shared/contracts.js'

/**
 * Native dialog bridge: folder/file pickers surfaced to the DSH page.
 */
export class DialogBridge {
  readonly #window: () => BrowserWindow | undefined

  public constructor(window: () => BrowserWindow | undefined) {
    this.#window = window
  }

  public async pickFiles(): Promise<DialogPickFilesResult> {
    const parent = this.#window()
    if (parent === undefined) return { ok: false }
    const result = await dialog.showOpenDialog(parent, {
      title: '选择要引用的文件',
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return { ok: true, paths: [], canceled: true }
    return { ok: true, paths: result.filePaths }
  }

  public async pickDirectory(options?: { defaultPath?: string }): Promise<DialogPickDirectoryResult> {
    const parent = this.#window()
    if (parent === undefined) return { ok: false }
    const result = await dialog.showOpenDialog(parent, {
      title: '选择文件夹',
      ...(options?.defaultPath !== undefined ? { defaultPath: options.defaultPath } : {}),
      properties: ['openDirectory'],
    })
    if (result.canceled) return { ok: true, canceled: true }
    const path = result.filePaths[0]
    return path === undefined ? { ok: true } : { ok: true, path }
  }
}
