# Integrated CPU monitor

VORTEX uses unmodified binaries from Libre Hardware Monitor v0.9.6 (.NET Framework 4.7.2).
Source and original distribution: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6
LibreHardwareMonitorLib is licensed under Mozilla Public License 2.0; see licenses/LibreHardwareMonitor-LICENSE.txt.
Corresponding library source: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/v0.9.6/LibreHardwareMonitorLib

The included official PawnIO 2.2.0 installer is redistributed unmodified, as permitted by the installer.
Source: https://github.com/namazso/PawnIO
Official installer: https://github.com/namazso/PawnIO.Setup/releases/tag/2.2.0
SHA-256: 1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032
Its signature is checked before launch. Only the official signed edition is installed.
See licenses/PawnIO-LICENSE.txt and https://pawnio.eu/.

Microsoft System.* and Microsoft.Bcl.* runtime support libraries are included unmodified from the upstream package. See licenses/dotnet-LICENSE.txt.
HidSharp is included unmodified from the upstream package. See licenses/HidSharp-LICENSE.txt.

The independent PowerShell CPU helper also uses unmodified ZenStates-Core 1.91 (.NET Framework 2.0 build), licensed under GPL-3.0-or-later. The helper scripts collect.ps1 and smu.ps1 are supplied as source under the same license; the Electron application communicates with this separate process through JSON.
Original release: https://github.com/irusanov/ZenStates-Core/releases/tag/v1.91
Release archive SHA-256: 3836958845746094901aec1a5edad371c1aa7a9fa89b72224dedeeed05b642ed
Corresponding complete upstream source and build files: licenses/ZenStates-Core-v1.91-source.zip
License: licenses/ZenStates-Core-LICENSE.txt
The release DLL is redistributed unchanged. There is no dependency on Ryzen Master.
