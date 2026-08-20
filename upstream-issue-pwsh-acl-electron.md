# [Windows] pwsh crashes with 0xC0000142 (STATUS_DLL_INIT_FAILED) when the harness runs inside Electron

## Summary

When the DSH harness runs hosted inside **Electron** (e.g. an Electron desktop wrapper spawning the harness with `ELECTRON_RUN_AS_NODE=1`, the standard embedding shape), the `pwsh` tool fails on Windows in **every confined sandbox mode** (`read-only`, `workspace-write`): the PowerShell child process spawned through the Windows ACL restricted-token runner dies with `0xC0000142` (STATUS_DLL_INIT_FAILED) before producing any output.

The **same runner works perfectly under plain Node** — so the official CLI is unaffected; the failure is specific to Electron-hosted harnesses.

Environment used for reproduction:

- Windows 10 22H2 (build 19045)
- DSH `0.1.0-rc.7`
- Node `v24.16.0` (plain) / Electron `43.4.0` (node mode)
- PowerShell 7.x at `C:\Program Files\PowerShell\7\pwsh.exe`

## Reproduction (three-way control)

Prepare two directories first:

```powershell
$ws = Join-Path $env:TEMP 'acl-test-ws'
$tp = Join-Path $env:TEMP 'acl-test-tmp'
New-Item -ItemType Directory -Force -Path $ws, $tp | Out-Null
$runner = "<harness>\node_modules\@deepseek-ai\dsh-sandbox-windows-acl\lib\runner.js"
```

### Case 1 — plain Node + runner + pwsh 7 (works)

```powershell
node $runner --workspace $ws --temp $tp --mode workspace-write -- "C:\Program Files\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -NonInteractive -Command "Write-Output acl-ok"
# stdout: acl-ok
# exit code: 0
```

### Case 2 — Electron node mode + runner + pwsh 7 (crashes)

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "<electron>\electron.exe" --expose-internals $runner --workspace $ws --temp $tp --mode workspace-write -- "C:\Program Files\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -NonInteractive -Command "Write-Output acl-ok"
# no output; the pwsh child dies with 0xC0000142 (DLL init failed)
```

### Case 3 — Electron node mode + direct spawn, no runner (works)

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "<electron>\electron.exe" --expose-internals -e "require('child_process').spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command','Write-Output baseline-ok'], {stdio:'inherit'}); process.exit(0)"
# stdout: baseline-ok
# exit code: 0
```

`read-only` mode reproduces identically (the runner is applied to both confined modes).

## What we traced

- `dsh-pwsh-sandbox`'s `SandboxPwshExecutor.run()/start()` wraps **every** confined invocation through `ctx.sandbox.confine()` (the ACL restricted-token runner); only `danger-full-access` skips it. So the desktop embedding cannot stay in `read-only`/`workspace-write` without breaking the `pwsh` tool.
- The runner creates a restricted token (logon SID + EVERYONE + capability SIDs; drops Authenticated Users / INTERACTIVE / LOCAL) and spawns the child via koffi (`CreateRestrictedToken`/`CreateProcessAsUserW`). Under an Electron-hosted parent the child never gets past DLL initialization.
- A plain Node parent with the identical runner argv works, so the restricted token itself is not the problem — the interaction with the Electron-hosted Node process (koffi FFI + process token/handle differences) is.

## Impact

- Any desktop product embedding the harness under Electron (Electron wrappers around `dsh web`, per the ecosystem's existing desktop projects) hits this in every confined mode; the pwsh tool surface is unusable unless the deployment falls back to `danger-full-access` (which also disables the file-effect sandbox and the approval stack).
- This is a real-world blocker for desktop distributions, and the failure mode (a raw `0xC0000142` with no `windows-acl-run:` signature, exit code not 127) is indistinguishable from a generic crash.

## Workaround we shipped (for reference)

We replaced the executor via the plugin seam, with **zero official-code changes**:

- A plugin exports a `SandboxPwshExecutor` subclass whose `run()/start()` skip `ctx.sandbox.confine()` while `process.versions.electron` is present (the local spawn path keeps working); outside Electron it behaves 1:1 with the official class.
- The profile patch disables the official `pwsh-sandbox` entry (one `ctx.shell` provider per context), keeping `workspace-write` file-effect sandboxing and approvals intact.

This works, but it means desktop embeddings permanently diverge from the official executor for pwsh.

## Suggested fixes (any would unblock)

1. **Diagnose and fix the koffi restricted-token spawn under Electron-hosted Node** (the preferred outcome). The runner already documents koffi pitfalls (e.g. `lpEnvironment` must be `NULL`); the Electron-specific failure is likely in the same FFI/process boundary.
2. If the runner cannot be made Electron-safe in the short term, at minimum **fail loudly instead of crashing**: detect the Electron-hosted parent (or the child's 0xC0000142 exit) and surface a clear `SANDBOX_UNAVAILABLE`-style error with remediation, rather than a naked DLL-init crash.
3. Consider an **explicit per-executor escape hatch** (e.g. a documented way for an embedding to run pwsh unconfined while keeping fs-sandbox and approvals), so desktop hosts do not have to subclass the executor themselves.

## Notes

- Verified against `0.1.0-rc.7`; the Windows ACL runner sources (`dsh-sandbox-windows-acl/lib/runner.js`, `dsh-pwsh-sandbox/lib/index.js`) are as shipped.
- The harness was spawned the same way our desktop does it: `electron.exe --expose-internals <dsh>/lib/bin.js --profile <name> --port 0` with `ELECTRON_RUN_AS_NODE=1`.

---

# 中文摘要（供参考）

**问题**：DSH 被 Electron 桌面壳嵌入运行时（`ELECTRON_RUN_AS_NODE` 方式），Windows 下 `pwsh` 工具在任何受限沙箱模式（read-only / workspace-write）都会以 `0xC0000142`（DLL 初始化失败）崩溃。
**对照实验**：① 纯 Node + 官方 ACL runner + pwsh7 → 正常；② Electron node + 同一 runner + pwsh7 → 必崩；③ Electron node + 直接 spawn（无 runner）→ 正常。→ 官方 CLI 用户不受影响，问题特定于 Electron 宿主。
**根因线索**：`dsh-pwsh-sandbox` 在受限模式下总是通过 koffi restricted-token runner 启动 pwsh（仅 danger-full-access 跳过）；该 runner 在 Electron 宿主下无法让子进程完成 DLL 初始化。
**我们的临时方案**：通过官方插件接缝替换执行器（Electron 下跳过 runner，其余行为与官方一致），官方代码零修改；但希望官方修复或提供显式逃生通道。
