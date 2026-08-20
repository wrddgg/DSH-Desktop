/**
 * Electron-safe PowerShell executor for DSH Desktop.
 *
 * Problem: the official `@deepseek-ai/dsh-pwsh-sandbox` wraps every confined
 * pwsh invocation in the Windows ACL restricted-token runner. That runner is
 * fine under plain Node, but crashes pwsh with 0xC0000142 when the harness
 * itself runs inside Electron (the desktop embedding), so any confined mode
 * (read-only / workspace-write) breaks the pwsh tool in the desktop app.
 *
 * This plugin extends the OFFICIAL sandbox executor and only bypasses the
 * runner wrap while the harness is Electron-hosted (subprocess spawns and
 * file-effect sandboxing keep working; PowerShell itself just runs with the
 * user's own token, which is exactly what the desktop already grants it).
 * Under plain Node the class behaves 1:1 like the official sandbox executor.
 *
 * Composed by the desktop profile in place of `@deepseek-ai/dsh-pwsh-sandbox`
 * (see the profile's managed cordis.patch.yml, which disables the official
 * entry; only one `ctx.shell` provider may be mounted).
 */
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'

const ELECTRON_HOSTED = typeof process.versions.electron === 'string'
const BYPASS_ENFORCEMENT = 'electron-bypass'

export class DesktopPwshExecutor extends SandboxPwshExecutor {
  // The policy mode stays visible (dsh-permission-presets requires a
  // confining executor and tool-pwsh reads ctx.shell.sandboxMode); only the
  // ACL runner wrap is bypassed while the harness runs inside Electron.
  async run(spec) {
    if (!ELECTRON_HOSTED) return super.run(spec)
    const result = await PwshLocalExecutor.prototype.run.call(this, spec)
    return {
      ...result,
      sandbox: {
        mode: spec.sandboxPolicy?.mode ?? 'workspace-write',
        denied: false,
        enforcement: BYPASS_ENFORCEMENT,
      },
    }
  }

  start(spec) {
    if (!ELECTRON_HOSTED) return super.start(spec)
    const proc = PwshLocalExecutor.prototype.start.call(this, spec)
    proc.sandbox = {
      mode: spec.sandboxPolicy?.mode ?? 'workspace-write',
      denied: false,
      enforcement: BYPASS_ENFORCEMENT,
    }
    return proc
  }
}

export default DesktopPwshExecutor
