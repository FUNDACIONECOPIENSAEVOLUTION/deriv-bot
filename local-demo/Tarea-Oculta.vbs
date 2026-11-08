' Ecopiensa: iniciar tareas Windows totalmente ocultas (sin consola emergente).
' Mantiene el proceso Node en el equipo; nunca transmite credenciales.
Option Explicit
Dim accion, ruta, script, shell, quote, cmd, rc
If WScript.Arguments.Count < 2 Then WScript.Quit 2
accion = LCase(CStr(WScript.Arguments(0)))
ruta = CStr(WScript.Arguments(1))
If accion <> "actualizar" And accion <> "vigilar" Then WScript.Quit 3
If InStr(ruta, Chr(34)) > 0 Then WScript.Quit 4
If accion = "actualizar" Then
 script = ruta & "\local-demo\Actualizar-Desde-GitHub.ps1"
Else
 script = ruta & "\local-demo\Vigilar-Ecopiensa.ps1"
End If
Set shell = CreateObject("WScript.Shell")
quote = Chr(34)
cmd = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & quote & script & quote & " -Ruta " & quote & ruta & quote
If accion = "actualizar" Then cmd = cmd & " -Silencioso"
' WindowStyle 0 = completamente oculto, sin parpadeo de PowerShell.
rc = shell.Run(cmd, 0, True)
If rc <> 0 Then
 On Error Resume Next
 Dim fso, log
 Set fso = CreateObject("Scripting.FileSystemObject")
 Set log = fso.OpenTextFile(ruta & "\local-demo\data\tareas-ocultas.log", 8, True)
 log.WriteLine Now & " " & accion & " exit=" & rc
 log.Close
End If
WScript.Quit rc
