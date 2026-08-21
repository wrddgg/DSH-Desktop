# Restart DSH Desktop with a remote debugging port, then run the CDP probe
# and write its result to cdp-probe-result.json. Detached process.
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop'
$log = Join-Path $root 'restart-log.txt'
$exe = 'C:\Program Files\DSH Desktop\DSH Desktop.exe'

"=== restart started $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
Start-Sleep -Seconds 8

Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4

Start-Process -FilePath $exe -ArgumentList '--remote-debugging-port=9223'
"started with CDP $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8

Start-Sleep -Seconds 30
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  "running probe" | Out-File $log -Append -Encoding utf8
  & node (Join-Path $root 'scripts\cdp-probe.mjs') (Join-Path $root 'cdp-probe-result.json') 2>> $log
  "probe exit: $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
} else {
  "node not found" | Out-File $log -Append -Encoding utf8
}
"=== restart done $(Get-Date -Format o) ===" | Out-File $log -Append -Encoding utf8
