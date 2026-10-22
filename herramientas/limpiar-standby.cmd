@echo off
setlocal
set "VORTEX_STANDBY_SCRIPT=%~dp0..\src\main\helpers\standby-cleaner.ps1"
if not exist "%VORTEX_STANDBY_SCRIPT%" (
  echo No se encontro el componente standby-cleaner.ps1.
  echo Vuelve a extraer la carpeta VORTEX completa.
  pause
  exit /b 1
)
powershell.exe -NoProfile -NonInteractive -Command "$p = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 goto elevate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%VORTEX_STANDBY_SCRIPT%" -Mode low
if errorlevel 1 (
  echo.
  echo Windows no pudo completar la limpieza. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Limpieza de baja prioridad finalizada.
pause
exit /b 0
:elevate
echo Se solicitaran permisos de administrador mediante Windows.
powershell.exe -NoProfile -Command "try { Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', ([string][char]34 + $env:VORTEX_STANDBY_SCRIPT + [string][char]34), '-Mode', 'low') -ErrorAction Stop; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo No se pudieron solicitar los permisos de administrador.
  pause
  exit /b 1
)
echo Comprueba el resultado en la ventana de PowerShell con administrador.
exit /b 0
