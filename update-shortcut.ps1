# Creates / repairs the Wellness Tracker shortcuts so they launch the CURRENT source in this
# folder via "Run Wellness Tracker.vbs" (no hard-coded path, no stale packaged .exe).
#   - Desktop shortcut
#   - Startup shortcut (opens the app at every sign-in)
#   - Start Menu entry (pin THIS one to the taskbar)
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File .\update-shortcut.ps1
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $here 'Run Wellness Tracker.vbs'
$icon   = Join-Path $here 'icon.ico'
if (-not (Test-Path $target)) { Write-Error "Launcher not found: $target"; exit 1 }

$shell = New-Object -ComObject WScript.Shell
$places = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop'))   'Wellness Tracker.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup'))   'Wellness Tracker.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs'))  'Wellness Tracker.lnk')
)
foreach ($lnkPath in $places) {
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath       = 'wscript.exe'
  $lnk.Arguments        = '"' + $target + '"'
  $lnk.WorkingDirectory = $here
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Description      = 'Wellness Tracker (runs current source)'
  $lnk.Save()
  Write-Host "Shortcut written: $lnkPath"
}
Write-Host "Done. Open Start, find 'Wellness Tracker', right-click > Pin to taskbar."
