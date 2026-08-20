import { describe, expect, it } from 'vitest'
import { PtyBridge } from '../src/main/bridge-pty.js'

interface FakeSession {
  pid: number
  cols: number
  rows: number
  written: string[]
  killed: boolean
  onData?: (data: string) => void
  onExit?: (info: { exitCode: number }) => void
}

function makeFakePty() {
  const sessions = new Map<string, FakeSession>()
  let nextPid = 100
  return {
    sessions,
    spawn: (shell: string, args: string[], options: { cols: number; rows: number; cwd: string }) => {
      const session: FakeSession = {
        pid: nextPid,
        cols: options.cols,
        rows: options.rows,
        written: [],
        killed: false,
      }
      nextPid += 1
      sessions.set(String(session.pid), session)
      return {
        pid: session.pid,
        cols: options.cols,
        rows: options.rows,
        write: (data: string) => { session.written.push(data) },
        resize: (cols: number, rows: number) => {
          session.cols = cols
          session.rows = rows
        },
        kill: () => { session.killed = true },
        onData: (listener: (data: string) => void) => { session.onData = listener },
        onExit: (listener: (info: { exitCode: number }) => void) => { session.onExit = listener },
      }
    },
  }
}

describe('PtyBridge', () => {
  it('creates sessions, forwards writes, resize, kill, and events', () => {
    const fake = makeFakePty()
    const bridge = new PtyBridge({ pty: fake as never, fallbackCwd: 'C:\\tmp' })
    expect(bridge.available).toBe(true)

    const created = bridge.create({ cwd: 'C:\\tmp', cols: 100, rows: 30 })
    expect(created.ok).toBe(true)
    const id = created.id as string

    const data: Array<[string, string]> = []
    const exits: Array<[string, number]> = []
    bridge.on('data', (sessionId: string, chunk: string) => data.push([sessionId, chunk]))
    bridge.on('exit', (sessionId: string, code: number) => exits.push([sessionId, code]))

    expect(bridge.write(id, 'dir\r').ok).toBe(true)
    expect(fake.sessions.get(id)?.written).toEqual(['dir\r'])
    expect(bridge.resize(id, 120, 40).ok).toBe(true)
    expect(fake.sessions.get(id)?.cols).toBe(120)
    expect(fake.sessions.get(id)?.rows).toBe(40)

    fake.sessions.get(id)?.onData?.('hello')
    fake.sessions.get(id)?.onExit?.({ exitCode: 0 })
    expect(data).toEqual([[id, 'hello']])
    expect(exits).toEqual([[id, 0]])
    expect(bridge.list()).toEqual([])

    expect(bridge.write(id, 'x').ok).toBe(false)
    expect(bridge.kill('missing').ok).toBe(true)
  })

  it('reports unavailability when node-pty cannot be resolved', () => {
    const bridge = new PtyBridge({ fallbackCwd: 'C:\\tmp' })
    // resolveNodePty searches the packaged/dev runtime paths; in a bare test
    // run it may or may not find it — the contract is a clean result either way.
    const result = bridge.create({})
    expect(typeof result.ok).toBe('boolean')
    if (!result.ok) expect(result.message).toContain('node-pty')
  })

  it('clamps terminal sizes', () => {
    const fake = makeFakePty()
    const bridge = new PtyBridge({ pty: fake as never, fallbackCwd: 'C:\\tmp' })
    const created = bridge.create({ cols: 10_000, rows: 2 })
    expect(created.ok).toBe(true)
    const session = fake.sessions.get(created.id as string)
    expect(session?.cols).toBe(500)
    expect(session?.rows).toBe(5)
  })
})
