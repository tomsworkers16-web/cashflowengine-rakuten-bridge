' Astonish Factory M8 remote bridge: hidden, fixed-command launcher.
' Use only on the M8 with the Windows user who registered the GitHub token.
' Wait=True keeps the scheduled task active while the bridge is running.
Option Explicit
Dim sh, fs, bridge, command, powershell
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
bridge = "C:\AI-Factory\M8Remote\bridge.ps1"
powershell = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
If Not fs.FileExists(bridge) Then
    WScript.Quit 2
End If
command = Chr(34) & powershell & Chr(34) & " -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & bridge & Chr(34)
WScript.Quit sh.Run(command, 0, True)
