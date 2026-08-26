@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo   실기 서술형 연습 - 종료
echo.

set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4000 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
  if not errorlevel 1 (
    set FOUND=1
    echo   종료했습니다. ^(PID %%p^)
  )
)

if "!FOUND!"=="0" echo   실행 중인 앱이 없습니다.
echo.
timeout /t 2 >nul
