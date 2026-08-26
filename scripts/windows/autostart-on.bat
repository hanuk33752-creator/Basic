@echo off
chcp 65001 >nul
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\ExamQuizApp.vbs"
set "TARGET=%~dp0run-hidden.vbs"

echo.
echo   윈도우에 로그인하면 앱이 자동으로 켜지도록 등록합니다.
echo.

REM 절대 경로를 박아넣은 시작 스크립트를 만든다.
> "%LINK%" echo ' 실기 서술형 연습 - 로그인 시 자동 시작 (autostart-off.bat 으로 해제)
>> "%LINK%" echo Set sh = CreateObject("WScript.Shell")
>> "%LINK%" echo sh.Run "wscript //nologo ""%TARGET%""", 0, False

if exist "%LINK%" (
  echo   등록 완료.
  echo   다음 로그인부터 자동으로 켜집니다. 브라우저에서 http://localhost:4000 으로 접속하세요.
  echo   해제하려면 autostart-off.bat 을 실행하세요.
) else (
  echo   [오류] 등록에 실패했습니다.
)
echo.
pause
