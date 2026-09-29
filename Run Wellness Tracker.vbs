' Launches the Wellness Tracker from the folder this script lives in (no hard-coded path),
' so it keeps working wherever the checkout is moved. Runs the current source via Electron.
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npx electron .", 0, False
