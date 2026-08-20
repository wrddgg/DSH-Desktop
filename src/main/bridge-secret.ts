import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { SecretResult } from '../shared/contracts.js'

interface SecretsFile {
  version: 1
  entries: Record<string, string>
}

const KEY_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/

/**
 * Secret storage for provider API keys. V1 stores values encrypted with the
 * OS-bound Electron safeStorage key (DPAPI on Windows) in a userData file;
 * migrating to the Windows Credential Manager is a planned follow-up. Fails
 * closed when encryption is unavailable.
 */
export class SecretStore {
  readonly #file: string
  readonly #log: (scope: string, message: string) => void

  public constructor(log: (scope: string, message: string) => void) {
    this.#file = join(app.getPath('userData'), 'secrets.json')
    this.#log = log
  }

  public async get(key: string): Promise<SecretResult> {
    if (!KEY_PATTERN.test(key)) return { ok: false, message: 'Invalid secret key' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, message: '系统加密不可用，无法读取密钥' }
    }
    try {
      const store = await this.#load()
      const encrypted = store.entries[key]
      if (encrypted === undefined) return { ok: true }
      const value = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      return { ok: true, value }
    } catch (error) {
      void this.#log('secret:error', error instanceof Error ? error.message : String(error))
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async set(key: string, value: string): Promise<SecretResult> {
    if (!KEY_PATTERN.test(key)) return { ok: false, message: 'Invalid secret key' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, message: '系统加密不可用，无法保存密钥' }
    }
    try {
      const store = await this.#load()
      const encrypted = safeStorage.encryptString(value).toString('base64')
      store.entries[key] = encrypted
      await this.#persist(store)
      return { ok: true }
    } catch (error) {
      void this.#log('secret:error', error instanceof Error ? error.message : String(error))
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  public async delete(key: string): Promise<SecretResult> {
    if (!KEY_PATTERN.test(key)) return { ok: false, message: 'Invalid secret key' }
    try {
      const store = await this.#load()
      delete store.entries[key]
      await this.#persist(store)
      return { ok: true }
    } catch (error) {
      void this.#log('secret:error', error instanceof Error ? error.message : String(error))
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  async #load(): Promise<SecretsFile> {
    try {
      const raw = await readFile(this.#file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<SecretsFile>
      if (parsed?.version === 1 && parsed.entries !== null && typeof parsed.entries === 'object') {
        return { version: 1, entries: parsed.entries as Record<string, string> }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return { version: 1, entries: {} }
  }

  async #persist(store: SecretsFile): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true })
    const temporary = `${this.#file}.tmp`
    await writeFile(temporary, JSON.stringify(store, null, 2), 'utf8')
    await rename(temporary, this.#file)
  }
}
