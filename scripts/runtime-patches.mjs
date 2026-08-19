/**
 * Small compatibility patches applied to the pinned official DSH runtime at
 * packaging time. The application still runs the official packages; these
 * patches only repair integration defects that are specific to the Electron
 * host.
 */

/**
 * Keep the Win32 directory picker worker connected after its `showing` notice.
 *
 * The official rc.7 worker uses the same IPC helper for the initial
 * `showing` message and the final `done`/`error` message, and disconnects in
 * the send callback. Disconnecting after `showing` terminates the child while
 * the modal dialog is still open, which surfaces in the UI as
 * "worker exited before reporting a result".
 */
export function patchNativePickerWorkerSource(source) {
  const utf16Needle = `
function readUtf16(koffi, address) {
\tconst bytes = Buffer.from(koffi.view(address, 32768));
\tlet end = 0;
\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
\treturn bytes.toString("utf16le", 0, end);
}`
  const utf16Replacement = `
function readUtf16(koffi, address) {
\t// Electron forbids external ArrayBuffer views for native addresses. Use
\t// Koffi's direct UTF-16 decoder instead of koffi.view(), which crashes the
\t// worker with napi_get_last_error_info on real Windows builds.
\treturn koffi.decode.string16(address);
}`
  const needle = `
const post = (message) => {
	/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
	send(message, () => {
		if (process.connected) process.disconnect();
	});
};`
  const replacement = `
const post = (message) => {
	/* v8 ignore next 3 -- disconnect needs a live IPC channel until the final result. */
	send(message, () => {
		if (message.kind !== "showing" && process.connected) process.disconnect();
	});
};`
  if (!source.includes(needle)) {
    throw new Error('Unsupported @deepseek-ai/dsh-host-directory-picker-native worker shape; refusing to package an unpatched picker')
  }
  if (!source.includes(utf16Needle)) {
    throw new Error('Unsupported UTF-16 reader shape; refusing to package an unpatched picker')
  }
  return source.replace(utf16Needle, utf16Replacement).replace(needle, replacement)
}
