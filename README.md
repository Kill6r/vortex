# VORTEX 0.86

Optimizador de Windows desarrollado con JavaScript, Node.js, Electron y React. Los cambios del sistema son opcionales y no garantizan mejoras de FPS.

## Nuevo en v0.86

- La cabecera propia de VORTEX es ahora la barra de titulo de la ventana. Los botones permiten minimizar a la barra de tareas, maximizar o restaurar y cerrar.
- Minimizar (-) no oculta VORTEX en la bandeja. Pulsar X lo envia a la bandeja cuando esta habilitada la opcion "Cerrar a la bandeja" en Ajustes; el menu del icono de la bandeja contiene "Salir de VORTEX" para terminar completamente.
- HAGS intenta leer `HwSchSupported` y `HwSchEnabled` desde el controlador WDDM por `D3DKMTQueryAdapterInfo`. Muestra el estado efectivo por separado del valor guardado en `HwSchMode` y distingue los reinicios pendientes. En equipos donde el controlador no ofrece el dato, VORTEX lo indica claramente.
- ReBAR intenta consultar el tamano real de BAR1 mediante `nvidia-smi -q -d MEMORY`. Si no esta disponible, conserva la lectura de recursos PCI de Windows. Una BAR mayor que 512 MB constituye evidencia de mapeo ampliado, no prueba que todos los juegos usen ReBAR. No se modifica el firmware ni la BIOS.
- Trece nuevos tweaks propios por categorias: modo oscuro, alineacion, Vista de tareas, Widgets, segundos del reloj, extensiones de archivos, retraso de menus, Finalizar tarea, Modo juego, capturas Game DVR, aceleracion de mouse, pantalla de bloqueo y sugerencias. Cada tweak requiere confirmacion, almacena los valores anteriores y ofrece restauracion individual. No se alteran las protecciones de Windows.

## Compilar

En Windows 10/11, con Node.js 22 o 24:

```powershell
npm install
npm test
npm run dist
```

El instalador se crea en `release`. Las actualizaciones de la aplicacion instalada se distribuyen mediante GitHub Releases. El codigo ha superado pruebas automatizadas de JavaScript y verificacion de sintaxis JSX, pero las consultas nativas de HAGS/ReBAR y la ventana sin bordes requieren validacion directa en Windows.

## Seguridad y autoria

VORTEX no modifica HVCI, Defender o Windows Update silenciosamente. No se copian el codigo ni los recursos graficos de Sparkle; los tweaks adicionales estan implementados de forma independiente, inspirados en las categorias funcionales que el proyecto documenta.

Referencia del proyecto Sparkle: https://github.com/thedogecraft/sparkle
