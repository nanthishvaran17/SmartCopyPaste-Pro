@echo off
setlocal
echo ===================================================
echo     SmartPaste Pro - Windows Desktop Setup
echo ===================================================
echo.

set TARGET_DIR=%~dp0
set TARGET_EXE=%TARGET_DIR%SmartPastePro.exe
set ICON_FILE=%TARGET_DIR%icons\icon.ico
set SHORTCUT_PATH=%USERPROFILE%\Desktop\SmartPaste Pro.lnk

if not exist "%TARGET_EXE%" (
    echo [ERROR] SmartPastePro.exe not found!
    pause
    exit /b 1
)

echo Creating Desktop shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_EXE%'; $s.WorkingDirectory = '%TARGET_DIR%'; if (Test-Path '%ICON_FILE%') { $s.IconLocation = '%ICON_FILE%' }; $s.Save();"

echo.
echo [SUCCESS] SmartPaste Pro desktop shortcut created on your Desktop!
echo Location: %SHORTCUT_PATH%
echo.
echo Launching SmartPaste Pro...
start "" "%TARGET_EXE%"
exit /b 0
