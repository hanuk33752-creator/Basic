@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

echo.
echo   실기 서술형 연습
echo   ------------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 goto nonode

REM 이미 켜져 있으면 브라우저만 연다.
call :isup
if not errorlevel 1 goto alreadyup

REM ── 부품 설치가 필요한지 ─────────────────────────────────────
REM node_modules 유무만 보면 업데이트로 새 패키지가 늘어난 걸 놓친다.
REM package.json 이 마지막 설치보다 새로우면 다시 설치한다.
if not exist "node_modules" goto dosetup
if not exist "server\node_modules" goto dosetup
if not exist "web\node_modules" goto dosetup
if not exist "node_modules\.setup-stamp" goto dosetup
call :setupstale
if errorlevel 1 goto dosetup
goto checkbuild

:dosetup
echo   부품을 설치합니다. 몇 분 걸립니다...
echo.
call npm run setup
if errorlevel 1 goto failed
echo.> "node_modules\.setup-stamp"
echo.

REM ── 화면 빌드가 최신인지 ─────────────────────────────────────
:checkbuild
if not exist "web\dist\index.html" goto dobuild
call :buildstale
if errorlevel 1 goto dobuild
goto launch

:dobuild
echo   화면을 준비합니다...
call npm run build
if errorlevel 1 goto failed
echo.

:launch
if not exist "server\data" mkdir "server\data"
echo   서버를 시작합니다...
wscript //nologo "%~dp0run-hidden.vbs"

REM 서버가 실제로 응답할 때까지 최대 30초 기다린다.
set /a TRIES=0
:wait
set /a TRIES+=1
call :isup
if not errorlevel 1 goto ready
if %TRIES% GEQ 30 goto timedout
timeout /t 1 /nobreak >nul
goto wait

:ready
echo   준비됐습니다. 브라우저를 엽니다.
start "" http://localhost:4000
timeout /t 2 /nobreak >nul
exit /b 0

:alreadyup
echo   이미 실행 중입니다. 브라우저를 엽니다.
start "" http://localhost:4000
timeout /t 2 /nobreak >nul
exit /b 0

:nonode
echo   [오류] Node.js 가 설치되어 있지 않습니다.
echo          https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
goto stop

:timedout
echo.
echo   [오류] 서버가 30초 안에 뜨지 않았습니다.
echo.
echo   서버 로그 마지막 부분:
echo   ------------------------------------
if not exist "server\data\server.log" echo   로그 파일이 만들어지지 않았습니다.
if exist "server\data\server.log" powershell -NoProfile -Command "Get-Content 'server\data\server.log' -Tail 20"
echo   ------------------------------------
echo.
echo   troubleshoot.bat 을 실행하면 자세한 오류를 볼 수 있습니다.
goto stop

:failed
echo.
echo   [오류] 준비 중 문제가 발생했습니다. 위 메시지를 확인해 주세요.
goto stop

:stop
echo.
pause
exit /b 1


REM ══ 아래는 call 로만 쓰이는 판정 루틴 ═══════════════════════

REM 서버가 실제로 접속을 받으면 errorlevel 0.
REM netstat 대신 실제 연결을 시도해 TIME_WAIT 오검출과 언어팩 문제를 피한다.
:isup
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',4000);exit 0}catch{exit 1}finally{$c.Dispose()}" >nul 2>&1
exit /b %errorlevel%

REM package.json 중 하나라도 설치 시각보다 새로우면 errorlevel 1
:setupstale
powershell -NoProfile -Command "$s=(Get-Item 'node_modules\.setup-stamp').LastWriteTime; $a=(Get-Item 'package.json').LastWriteTime; $b=(Get-Item 'server\package.json').LastWriteTime; $c=(Get-Item 'web\package.json').LastWriteTime; if ($a -gt $s -or $b -gt $s -or $c -gt $s) { exit 1 }; exit 0"
exit /b %errorlevel%

REM 화면 소스가 빌드 결과보다 새로우면 errorlevel 1
:buildstale
powershell -NoProfile -Command "$d=(Get-Item 'web\dist\index.html').LastWriteTime; $items=@(Get-ChildItem -Recurse -File 'web\src' -ErrorAction SilentlyContinue) + @(Get-Item 'web\index.html' -ErrorAction SilentlyContinue) + @(Get-Item 'web\vite.config.js' -ErrorAction SilentlyContinue); $max=[datetime]::MinValue; foreach ($x in $items) { if ($x.LastWriteTime -gt $max) { $max=$x.LastWriteTime } }; if ($max -gt $d) { exit 1 }; exit 0"
exit /b %errorlevel%
