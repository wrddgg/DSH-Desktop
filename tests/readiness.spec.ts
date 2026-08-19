import { describe, expect, it } from 'vitest'
import { isAllowedHarnessUrl, parseHarnessUrl } from '../src/main/readiness.js'

describe('parseHarnessUrl', () => {
  it('extracts an official loopback readiness URL', () => {
    expect(parseHarnessUrl('dsh web: http://127.0.0.1:43129')).toBe('http://127.0.0.1:43129/')
  })

  it('rejects non-loopback hosts and unrelated output', () => {
    expect(parseHarnessUrl('dsh web: http://192.168.1.8:43129')).toBeUndefined()
    expect(parseHarnessUrl('ready on port 43129')).toBeUndefined()
  })
})

describe('isAllowedHarnessUrl', () => {
  it('allows only the ready Harness origin', () => {
    const ready = 'http://127.0.0.1:43129/'
    expect(isAllowedHarnessUrl('http://127.0.0.1:43129/session/1', ready)).toBe(true)
    expect(isAllowedHarnessUrl('http://127.0.0.1:43130/', ready)).toBe(false)
    expect(isAllowedHarnessUrl('https://example.com/', ready)).toBe(false)
  })
})
