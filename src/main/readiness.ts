const READY_LINE = /dsh web:\s*(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(?:\/\S*)?)/i

export function parseHarnessUrl(line: string): string | undefined {
  const match = READY_LINE.exec(line)
  if (match?.[1] === undefined) return undefined

  const parsed = new URL(match[1])
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return undefined
  return parsed.toString()
}

export function isAllowedHarnessUrl(candidate: string, readyUrl: string | undefined): boolean {
  if (readyUrl === undefined) return false
  try {
    return new URL(candidate).origin === new URL(readyUrl).origin
  } catch {
    return false
  }
}
