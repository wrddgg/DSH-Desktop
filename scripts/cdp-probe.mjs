/**
 * CDP probe: connects to the DSH Desktop renderer over Chrome DevTools
 * Protocol and reports which product client plugins actually executed in the
 * page (styles injected, modules materialized, bridge present).
 */
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')

const OUT = process.argv[2] ?? join(process.cwd(), 'cdp-probe-result.json')
const CDP = 'http://127.0.0.1:9223/json'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function targets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(CDP, { signal: AbortSignal.timeout(3000) })
      if (response.ok) return await response.json()
    } catch {
      // not ready yet
    }
    await sleep(1500)
  }
  return undefined
}

const PROBE = `(() => {
  const styles = [...document.querySelectorAll('style[data-plugin]')].map(s => s.dataset.plugin)
  const cacheKeys = [...(window.__DSH_MODULES__?.loadCache?.keys?.() ?? [])]
  const bootEntries = (window.__DSH_BOOT__?.entries ?? []).map(e => e.id)
  return JSON.stringify({
    url: location.href,
    dshDesktop: typeof window.dshDesktop,
    bootEntries: bootEntries.filter(id => id.includes('wrddgg')),
    moduleCache: cacheKeys.filter(id => id.includes('wrddgg')),
    styles,
  })
})()`

async function main() {
  const list = await targets()
  if (list === undefined) {
    await writeFile(OUT, JSON.stringify({ error: 'CDP never became reachable' }, null, 2))
    return
  }
  const page = (list.find(t => t.type === 'page' && /127\.0\.0\.1|localhost/.test(t.url ?? '')) ?? list.find(t => t.type === 'page'))
  if (page === undefined) {
    await writeFile(OUT, JSON.stringify({ error: 'no page target', list }, null, 2))
    return
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  const result = await new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ error: 'probe timed out' }) }
    }, 20000)
    socket.on('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: PROBE, returnByValue: true } }))
    })
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw))
      if (message.id === 1) {
        if (!done) { done = true; clearTimeout(timer); resolve(message.result?.result?.value ?? { error: 'no value', raw: message }) }
      }
    })
    socket.on('error', (error) => {
      if (!done) { done = true; clearTimeout(timer); resolve({ error: String(error) }) }
    })
  })
  await writeFile(OUT, JSON.stringify(result, null, 2))
  socket.close()
}

await main()
