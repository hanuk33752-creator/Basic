' 콘솔 창 없이 서버를 띄운다. start-app.bat 과 자동 시작 등록에서 함께 쓴다.
' 브라우저는 start-app.bat 이 서버가 실제로 뜬 것을 확인한 뒤 직접 연다.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' scripts\windows\run-hidden.vbs 에서 세 단계 위가 프로젝트 루트
appRoot = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
sh.CurrentDirectory = appRoot

' 0 = 창 숨김, False = 종료를 기다리지 않음
' 오류를 추적할 수 있도록 로그를 남긴다.
sh.Run "cmd /c node server\src\index.js > server\data\server.log 2>&1", 0, False
