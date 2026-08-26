@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

echo.
echo   실기 서술형 연습 - 강제 재설치
echo   ------------------------------------
echo   부품과 화면 빌드를 지우고 처음부터 다시 만듭니다.
echo   문제은행 데이터(server\data\app.db)와 .env 는 건드리지 않습니다.
echo.
choice /c YN /m "계속할까요"
if errorlevel 2 exit /b 0
echo.

call "%~dp0stop-app.bat"

echo   기존 부품을 지웁니다...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "server\node_modules" rmdir /s /q "server\node_modules"
if exist "web\node_modules" rmdir /s /q "web\node_modules"
if exist "web\dist" rmdir /s /q "web\dist"

echo   다시 설치합니다. 몇 분 걸립니다...
echo.
call npm run setup
if errorlevel 1 goto failed
echo. > "node_modules\.setup-stamp"

echo.
echo   화면을 빌드합니다...
call npm run build
if errorlevel 1 goto failed

echo.
echo   완료됐습니다. start-app.bat 으로 실행하세요.
echo.
pause
exit /b 0

:failed
echo.
echo   [오류] 재설치 중 문제가 발생했습니다. 위 메시지를 확인해 주세요.
echo.
pause
exit /b 1
