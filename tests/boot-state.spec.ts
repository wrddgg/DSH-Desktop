import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BootStateStore, type BootRecord } from '../src/main/boot-state.js'
import { detectSuspectedPlugin } from '../src/main/harness-supervisor.js'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function makeStore(): Promise<BootStateStore> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-boot-state-'))
  temporary.push(dir)
  return new BootStateStore(join(dir, 'boot-state.json'))
}

function crashedAt(startedAt: number, suspectedPlugin?: string): BootRecord {
  const record: BootRecord = { startedAt, outcome: 'crashed', mode: 'normal', exitCode: 1 }
  if (suspectedPlugin !== undefined) record.suspectedPlugin = suspectedPlugin
  return record
}

describe('BootStateStore crash-loop detection', () => {
  it('flags a crash loop after three normal-mode crashes in the window', async () => {
    const store = await makeStore()
    const now = Date.now()
    store.state.boots = [
      crashedAt(now - 2_000),
      crashedAt(now - 4_000, 'dsh-bad-plugin'),
      crashedAt(now - 6_000),
    ]
    const snapshot = store.snapshot(now)
    expect(snapshot.crashLoop).toBe(true)
    expect(snapshot.suspectedPlugin).toBe('dsh-bad-plugin')
  })

  it('ignores safe-mode crashes and stale records', async () => {
    const store = await makeStore()
    const now = Date.now()
    store.state.boots = [
      { startedAt: now - 2_000, outcome: 'crashed', mode: 'safe', exitCode: 1 },
      crashedAt(now - 60 * 60_000),
      crashedAt(now - 61 * 60_000),
    ]
    expect(store.snapshot(now).crashLoop).toBe(false)
  })

  it('clears the loop once a later boot survives the health window', async () => {
    const store = await makeStore()
    const now = Date.now()
    store.state.boots = [crashedAt(now - 8_000), crashedAt(now - 6_000), crashedAt(now - 4_000)]
    store.markLastGood()
    await store.flush()
    expect(store.snapshot(now).crashLoop).toBe(false)
  })

  it('persists and reloads boots and disabled plugins', async () => {
    const store = await makeStore()
    store.recordStart('normal')
    store.addDisabledPlugin('dsh-bad-plugin')
    store.addDisabledPlugin('dsh-bad-plugin')
    store.markLastGood()
    await store.flush()

    const reloaded = new BootStateStore(store.file)
    await reloaded.load()
    expect(reloaded.state.boots).toHaveLength(1)
    expect(reloaded.state.disabledPlugins).toEqual(['dsh-bad-plugin'])
    expect(reloaded.state.lastGoodAt).toBeDefined()
  })

  it('tolerates a corrupt or missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-boot-state-'))
    temporary.push(dir)
    const file = join(dir, 'boot-state.json')
    const store = new BootStateStore(file)
    await store.load()
    expect(store.snapshot().crashLoop).toBe(false)
  })
})

describe('detectSuspectedPlugin', () => {
  it('finds the last non-official package name in the crash tail', () => {
    const lines = [
      'loading @deepseek-ai/dsh-base',
      "error: failed @wrddgg/dsh-desktop-plugin",
      "Error while loading dsh-bad-plugin@1.2.3",
    ]
    expect(detectSuspectedPlugin(lines)).toBe('dsh-bad-plugin')
  })

  it('ignores official and product packages', () => {
    expect(detectSuspectedPlugin([
      'fiber failed: @deepseek-ai/dsh-web-app',
      'fiber failed: @wrddgg/dsh-desktop-file-ref',
    ])).toBeUndefined()
  })

  it('returns undefined for an empty tail', () => {
    expect(detectSuspectedPlugin([])).toBeUndefined()
  })
})
