!macro customCheckAppRunning
  DetailPrint "Closing existing ${PRODUCT_NAME} processes..."
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  Sleep 1000
!macroend
