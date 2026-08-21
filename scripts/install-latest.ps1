# Install the current DSH Desktop build over the running baseline, then start it.
# Runs as a detached process so it survives the app being killed mid-install.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop\install-log.txt'
$installer = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop\release\DSH-Desktop-Setup-1.0.0-x64.exe'
$newExe = 'C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\DSH Desktop.exe'

"=== install started $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8

# Give the host a moment to deliver its message before the app is closed.
Start-Sleep -Seconds 10

"closing running DSH Desktop processes" | Out-File $log -Append -Encoding utf8
Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

"running installer: $installer /S" | Out-File $log -Append -Encoding utf8
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
"installer exit code: $($proc.ExitCode)" | Out-File $log -Append -Encoding utf8

Start-Sleep -Seconds 2
if (Test-Path $newExe) {
  "starting $newExe" | Out-File $log -Append -Encoding utf8
  Start-Process $newExe
  "=== install done $(Get-Date -Format o) ===" | Out-File $log -Append -Encoding utf8
} else {
  "ERROR: new exe not found at $newExe" | Out-File $log -Append -Encoding utf8
  Get-ChildItem 'C:\Users\Administrator\AppData\Local\Programs' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'DSH|dsh' } | Select-Object -ExpandProperty FullName | Out-File $log -Append -Encoding utf8
}
