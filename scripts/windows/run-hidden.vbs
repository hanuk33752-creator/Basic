' 콘솔 창 없이 서버를 띄운다. start-app.bat 과 자동 시작 등록에서 함께 쓴다.
' 인자로 open 을 주면 서버가 준비된 뒤 브라우저까지 연다.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' scripts\windows\run-hidden.vbs 에서 세 단계 위가 프로젝트 루트
appRoot = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
sh.CurrentDirectory = appRoot

openBrowser = "0"
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "open" Then openBrowser = "1"
End If

' 0 = 창 숨김, False = 종료를 기다리지 않음
sh.Run "cmd /c set OPEN_BROWSER=" & openBrowser & " && node server\src\index.js", 0, False
