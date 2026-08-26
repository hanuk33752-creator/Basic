' 실기 서술형 연습 - 종료
' 이 폴더에서 실행 중인 서버만 골라서 끝냅니다. 다른 Node 프로그램은 건드리지 않습니다.

Option Explicit
Dim fso, appRoot, wmi, processes, process, killed, commandLine

Set fso = CreateObject("Scripting.FileSystemObject")
appRoot = fso.GetParentFolderName(WScript.ScriptFullName)

killed = 0
On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
If Err.Number <> 0 Then
  MsgBox "프로세스 목록을 읽지 못했습니다." & vbCrLf & _
         "작업 관리자에서 Node.js 프로세스를 직접 끝내 주세요.", vbExclamation, "실기 서술형 연습"
  WScript.Quit 1
End If
On Error GoTo 0

Set processes = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'")
For Each process In processes
  commandLine = ""
  If Not IsNull(process.CommandLine) Then commandLine = process.CommandLine
  ' 이 폴더 경로가 명령줄에 들어 있는 프로세스만 종료한다.
  If InStr(LCase(commandLine), LCase(appRoot)) > 0 Then
    process.Terminate()
    killed = killed + 1
  End If
Next

If killed > 0 Then
  MsgBox "앱을 종료했습니다.", vbInformation, "실기 서술형 연습"
Else
  MsgBox "실행 중인 앱이 없습니다.", vbInformation, "실기 서술형 연습"
End If
