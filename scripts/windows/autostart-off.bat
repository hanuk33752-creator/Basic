@echo off
chcp 65001 >nul
setlocal
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ExamQuizApp.vbs"

echo.
if exist "%LINK%" (
  del /f /q "%LINK%"
  echo   자동 시작을 해제했습니다.
) else (
  echo   자동 시작이 등록되어 있지 않습니다.
)
echo.
pause
