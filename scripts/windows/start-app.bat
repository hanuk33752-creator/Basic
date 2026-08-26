@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

echo.
echo   실기 서술형 연습 - 시작
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [오류] Node.js 가 설치되어 있지 않습니다.
  echo          https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   최초 실행: 필요한 부품을 설치합니다. 몇 분 걸립니다...
  call npm run setup
  if errorlevel 1 goto failed
)

if not exist "web\dist\index.html" (
  echo   최초 실행: 화면을 준비합니다...
  call npm run build
  if errorlevel 1 goto failed
)

REM 이미 켜져 있으면 브라우저만 연다.
netstat -ano | findstr /r /c:":4000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo   이미 실행 중입니다. 브라우저를 엽니다.
  start "" http://localhost:4000
  timeout /t 2 >nul
  exit /b 0
)

echo   서버를 시작합니다. 잠시 후 브라우저가 열립니다.
echo   (이 창은 자동으로 닫힙니다. 앱은 계속 켜져 있습니다.)
echo.

REM 창 없이 백그라운드로 실행하고 서버가 뜨면 브라우저를 연다.
wscript //nologo "%~dp0run-hidden.vbs" open
timeout /t 2 >nul
exit /b 0

:failed
echo.
echo   [오류] 준비 중 문제가 발생했습니다. 위 메시지를 확인해 주세요.
echo.
pause
exit /b 1
