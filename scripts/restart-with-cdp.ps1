# Restart DSH Desktop with a remote debugging port so plugin loading can be
# inspected over CDP. Detached so it survives the app being killed.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop\restart-log.txt'
$exe = 'C:\Program Files\DSH Desktop\DSH Desktop.exe'

"=== restart started $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
Start-Sleep -Seconds 12

Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4

"starting with CDP: $exe" | Out-File $log -Append -Encoding utf8
Start-Process -FilePath $exe -ArgumentList '--remote-debugging-port=9223'
"=== restart done $(Get-Date -Format o) ===" | Out-File $log -Append -Encoding utf8
