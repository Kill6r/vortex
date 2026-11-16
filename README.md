# VORTEX

Optimizador de Windows desarrollado con JavaScript, Node.js, Electron y React. Los cambios del sistema son opcionales y no garantizan mejoras de FPS.

## Novedades de la versión 1.1.0

- El apartado de CPU muestra sensores en vivo, gráficas y grabaciones con duración configurable.
- El benchmark permite elegir hilos y duración, guarda el historial y compara rendimiento, temperatura y consumo.
- Pulsa **Conectar CPU** para leer los sensores de Ryzen 5000 Vermeer, 7000 Raphael y 9000 Granite Ridge con una tabla de firmware reconocida. El 9600X permite ajustar PPT, TDC, EDC, boost y Curve Optimizer. El 9800X3D con tabla 0x620105 permite ajustar Curve Optimizer y reducir los límites de potencia y corriente, con el boost y Scalar fijos.
- **Analizar CPU** revisa los sensores y los ajustes activos. **Buscar mejor perfil** mide distintas configuraciones y permite cargar la mejor que encontró para rendimiento o equilibrio. El benchmark sirve para comparar resultados. La estabilidad requiere pruebas adicionales.
- **Validar perfil** compara el perfil activo y el candidato en pruebas de 20 y 90 segundos. Muestra las diferencias de rendimiento, temperatura y consumo, y consulta los errores de hardware de Windows.
- Tweaks tiene un diseño más claro y el contenido queda centrado al cambiar de apartado.

Consulta los [avisos de terceros del lector de CPU](src/main/cpu-monitor/THIRD-PARTY-NOTICES.md) para ver las dependencias y sus licencias.

## Nuevo en v0.91

- Interruptores individuales con estado comprobado en Windows; desaparecen los dos botones Aplicar/Desactivar del catalogo de tweaks extra.
- Insignias de rendimiento, gaming, privacidad, IA, apariencia y recomendados, con tooltips y niveles de precaucion.
- Catalogo ampliado a 45 opciones de Windows con restauracion individual de los valores del registro. Algunas politicas pueden no funcionar en todas las versiones o ediciones de Windows.
- Nuevo apartado CPU y overclock: identifica el procesador, permite medir la carga y frecuencia durante diez muestras y abre la pagina oficial de Ryzen Master para Auto Overclock y Smart Stress Test donde sean compatibles.
- VORTEX no cambia el voltaje ni la frecuencia de la CPU. La lectura de referencia no equivale a un stress test.

## En v0.90

- Barra en tiempo real al buscar y descargar actualizaciones, con porcentaje real durante la descarga.
- Paleta discreta por seccion en Tweaks: verde petroleo para Windows, azul para graficos y violeta oscuro para extras.

## En la version v0.89

- La cabecera y el menu lateral incorporan un acabado oscuro tipo Acrylic, con desenfoque localizado y sin efectos costosos en cada tarjeta.
- En Windows 11 22H2 o posterior, Electron intenta activar Mica como material nativo del marco. Su visualizacion depende de la version de Windows y de la composicion de la ventana.
- El menu lateral tiene un indicador que se desplaza entre apartados y respeta la configuracion de movimiento reducido del sistema.
- Las transiciones entre paginas tienen desplazamiento corto y desenfoque ligero, manteniendo todas las funciones de la v0.86.

## Incluido desde v0.86

- La cabecera propia de VORTEX es ahora la barra de titulo de la ventana. Los botones permiten minimizar a la barra de tareas, maximizar o restaurar y cerrar.
- Minimizar (-) no oculta VORTEX en la bandeja. Pulsar X lo envia a la bandeja cuando esta habilitada la opcion "Cerrar a la bandeja" en Ajustes; el menu del icono de la bandeja contiene "Salir de VORTEX" para terminar completamente.
- HAGS intenta leer `HwSchSupported` y `HwSchEnabled` desde el controlador WDDM por `D3DKMTQueryAdapterInfo`. Muestra el estado efectivo por separado del valor guardado en `HwSchMode` y distingue los reinicios pendientes. En equipos donde el controlador no ofrece el dato, VORTEX lo indica claramente.
- ReBAR intenta consultar el tamano real de BAR1 mediante `nvidia-smi -q -d MEMORY`. Si no esta disponible, conserva la lectura de recursos PCI de Windows. Una BAR mayor que 512 MB constituye evidencia de mapeo ampliado, no prueba que todos los juegos usen ReBAR. No se modifica el firmware ni la BIOS.
- Trece tweaks propios iniciales por categorias: modo oscuro, alineacion, Vista de tareas, Widgets, segundos del reloj, extensiones de archivos, retraso de menus, Finalizar tarea, Modo juego, capturas Game DVR, aceleracion de mouse, pantalla de bloqueo y sugerencias. Cada tweak requiere confirmacion, almacena los valores anteriores y ofrece restauracion individual. No se alteran las protecciones de Windows.

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
