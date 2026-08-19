import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export class AppLogger {
  readonly #file: string

  public constructor(file: string) {
    this.#file = file
  }

  public get file(): string {
    return this.#file
  }

  public async write(scope: string, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] [${scope}] ${message.replaceAll('\r', '')}\n`
    await mkdir(dirname(this.#file), { recursive: true })
    await appendFile(this.#file, line, 'utf8')
  }
}
