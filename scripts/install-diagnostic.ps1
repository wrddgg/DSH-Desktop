# Install the diagnostic build over the running app (installer kills the app,
# installs, and relaunches via runAfterFinish). Detached process.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop\install2-log.txt'
$installer = 'C:\Users\Administrator\Desktop\DSH\DSH-Desktop\release\DSH-Desktop-Setup-1.0.0-x64.exe'

"=== install2 started $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
Start-Sleep -Seconds 10
$proc = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
"installer exit: $($proc.ExitCode) $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
