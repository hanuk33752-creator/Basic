@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

echo.
echo   실기 서술형 연습 - 문제 진단
echo   ------------------------------------
echo.

echo   [1] Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo       설치되어 있지 않습니다. https://nodejs.org 에서 LTS 를 설치하세요.
  goto stop
)
for /f "delims=" %%v in ('node -v') do echo       %%v  ^(22.5 이상 필요^)

echo   [2] 폴더
echo       %CD%
if exist "package.json" (echo       package.json 있음) else (echo       package.json 없음 - 압축을 잘못 푼 것 같습니다)
if exist "node_modules" (echo       node_modules 있음) else (echo       node_modules 없음 - npm run setup 필요)
if exist "web\dist\index.html" (echo       화면 빌드 있음) else (echo       화면 빌드 없음 - npm run build 필요)
if exist ".env" (echo       .env 있음) else (echo       .env 없음 - AI 채점 대신 로컬 규칙 채점으로 동작)

echo   [3] 4000 포트
netstat -ano | findstr ":4000" >nul 2>&1
if errorlevel 1 (echo       비어 있음) else (echo       이미 사용 중 - stop-app.bat 을 먼저 실행하세요)

echo.
echo   ------------------------------------
echo   이제 서버를 이 창에서 직접 켭니다. 오류가 있으면 아래에 그대로 나옵니다.
echo   확인이 끝나면 Ctrl+C 로 종료하세요.
echo   ------------------------------------
echo.

node server\src\index.js

:stop
echo.
pause
