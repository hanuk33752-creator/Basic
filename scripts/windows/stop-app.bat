@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

echo.
echo   실기 서술형 연습 - 종료
echo.

powershell -NoProfile -Command ^
  "$p = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue;" ^
  "if ($p) { $p | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host ('   종료했습니다. (PID ' + $_ + ')') } }" ^
  "else { Write-Host '   실행 중인 앱이 없습니다.' }"

echo.
timeout /t 2 /nobreak >nul
