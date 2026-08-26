' 실기 서술형 연습 - 실행
' 더블클릭하면 서버를 창 없이 띄우고, 주소창 없는 앱 창으로 화면을 엽니다.
' 바탕화면에 두려면: 이 파일 오른쪽 클릭 - [보내기] - [바탕 화면에 바로 가기 만들기]

Option Explicit
Dim fso, sh, appRoot, logPath, dataDir, firstRun, windowStyle, waitLimit, i, ok

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

appRoot = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appRoot
dataDir = fso.BuildPath(appRoot, "server\data")
logPath = fso.BuildPath(dataDir, "launch.log")

If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir

' 이미 떠 있으면 창만 연다.
If ServerIsUp() Then
  sh.Run "cmd /c node server\scripts\start.js", 0, False
  WScript.Quit 0
End If

If Not HasNode() Then
  MsgBox "Node.js 가 설치되어 있지 않습니다." & vbCrLf & vbCrLf & _
         "https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.", _
         vbExclamation, "실기 서술형 연습"
  WScript.Quit 1
End If

' 첫 실행은 설치·빌드에 몇 분 걸리므로 진행 상황이 보이도록 창을 띄운다.
firstRun = Not fso.FolderExists(fso.BuildPath(appRoot, "node_modules"))
If firstRun Then
  windowStyle = 1
  waitLimit = 600
  MsgBox "처음 실행이라 준비 작업을 합니다. 몇 분 걸립니다." & vbCrLf & _
         "검은 창이 뜨면 끝날 때까지 그대로 두세요.", vbInformation, "실기 서술형 연습"
Else
  windowStyle = 0
  waitLimit = 60
End If

sh.Run "cmd /c node server\scripts\start.js > """ & logPath & """ 2>&1", windowStyle, False

ok = False
For i = 1 To waitLimit
  If ServerIsUp() Then
    ok = True
    Exit For
  End If
  WScript.Sleep 1000
Next

If Not ok Then
  MsgBox "앱을 시작하지 못했습니다." & vbCrLf & vbCrLf & Tail(logPath, 15), _
         vbCritical, "실기 서술형 연습"
End If


Function HasNode()
  HasNode = (sh.Run("cmd /c node -v", 0, True) = 0)
End Function

Function ServerIsUp()
  Dim http
  ServerIsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", "http://localhost:4000/api/health", False
  http.Send
  If Err.Number = 0 Then ServerIsUp = (http.Status = 200)
  On Error GoTo 0
End Function

Function Tail(filePath, lineCount)
  Dim stream, lines, text, startIndex, j
  Tail = "(로그 파일이 없습니다)"
  If Not fso.FileExists(filePath) Then Exit Function
  Set stream = fso.OpenTextFile(filePath, 1)
  text = stream.ReadAll
  stream.Close
  lines = Split(Replace(text, vbCrLf, vbLf), vbLf)
  startIndex = UBound(lines) - lineCount
  If startIndex < 0 Then startIndex = 0
  text = ""
  For j = startIndex To UBound(lines)
    text = text & lines(j) & vbCrLf
  Next
  Tail = text
End Function
