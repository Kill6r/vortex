!include "LogicLib.nsh"

!macro customInit
  IfSilent fin
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  StrCmp $0 "" revisarEquipo
  Goto yaInstalado
revisarEquipo:
  ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  StrCmp $0 "" fin
yaInstalado:
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON1 "VORTEX ya esta instalado.$\r$\nQuieres reinstalar o actualizar la aplicacion?" IDYES preguntarDatos IDNO cancelar
preguntarDatos:
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "Quieres restablecer los perfiles y ajustes propios de VORTEX?$\r$\nNo modifica los cambios que ya aplicaste en Windows.$\r$\nSe guardaran copias de seguridad de los archivos." IDYES reiniciarDatos IDNO fin
reiniciarDatos:
  GetTime "" "L" $1 $2 $3 $4 $5 $6 $7
  StrCpy $9 "$3$2$1-$4$5$6"
  IfFileExists "$APPDATA\VORTEX\optimizer-settings.json" 0 +2
    Rename "$APPDATA\VORTEX\optimizer-settings.json" "$APPDATA\VORTEX\optimizer-settings.json.bak-$9"
  IfFileExists "$APPDATA\VORTEX\game-rules.json" 0 +2
    Rename "$APPDATA\VORTEX\game-rules.json" "$APPDATA\VORTEX\game-rules.json.bak-$9"
  Goto fin
cancelar:
  Abort
fin:
!macroend
