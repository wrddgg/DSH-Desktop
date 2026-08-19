import { describe, expect, it } from 'vitest'
import { patchNativePickerWorkerSource } from '../scripts/runtime-patches.mjs'

const workerSource = `
function readUtf16(koffi, address) {
\tconst bytes = Buffer.from(koffi.view(address, 32768));
\tlet end = 0;
\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
\treturn bytes.toString("utf16le", 0, end);
}
const post = (message) => {
	/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
	send(message, () => {
		if (process.connected) process.disconnect();
	});
};`

describe('official runtime compatibility patches', () => {
  it('uses Electron-safe UTF-16 decoding and keeps the worker alive after showing', () => {
    const patched = patchNativePickerWorkerSource(workerSource)
    expect(patched).toContain('koffi.decode.string16(address)')
    expect(patched).not.toContain('koffi.view(address, 32768)')
    expect(patched).toContain('message.kind !== "showing"')
    expect(patched).not.toContain('if (process.connected) process.disconnect();')
  })

  it('fails closed when the pinned worker shape changes', () => {
    expect(() => patchNativePickerWorkerSource('const post = () => {}')).toThrow(/worker shape/)
  })
})
