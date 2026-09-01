' 실기 서술형 연습 - 업데이트
' 최신 버전을 내려받아 덮어씁니다. 문제은행과 .env 는 그대로 유지됩니다.

Option Explicit
Dim fso, sh, appRoot

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appRoot = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(fso.BuildPath(appRoot, "package.json")) Then
  MsgBox "앱 폴더를 찾지 못했습니다." & vbCrLf & _
         "이 파일은 앱 폴더 안에 그대로 두고, 바탕화면에는 바로 가기를 만들어 주세요.", _
         vbExclamation, "실기 서술형 연습"
  WScript.Quit 1
End If

sh.CurrentDirectory = appRoot
' 진행 상황이 보이도록 창을 띄운다. 창을 띄운 뒤 곧바로 종료해
' 이 스크립트 파일 자체가 덮어써질 수 있게 한다.
sh.Run "cmd /c node server\scripts\update.js & echo. & pause", 1, False
