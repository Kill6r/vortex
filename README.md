# VORTEX 0.8.0

## Descripcion

VORTEX es un optimizador de Windows con administracion de servicios, perfiles de rendimiento para juegos, supervision de procesos, herramientas de memoria y ajustes avanzados. Desarrollado en JavaScript ES6+, Node.js, Electron y React.

Optimizador de escritorio para Windows 10 y 11. Implementado con JavaScript ES6+, Node.js, Electron, React y PowerShell. Interfaz en español, paneles planos y sin degradados decorativos.

## Nuevo en v0.80 — Limpiar memoria integrado

**Memoria RAM** ahora reúne la lectura de consumo, los perfiles, el botón **Limpiar memoria**, la programación de limpieza conservadora y la selección manual de aplicaciones. Se eliminó la página independiente «Caché standby» del menú lateral. La herramienta sigue consultando la memoria standby de Windows, pero la presenta con nombres más claros. El botón principal intenta limpiar únicamente la caché de baja prioridad cuando la comprobación recomienda hacerlo.

Para ver el vaciado completo, abre **Memoria RAM → Limpiar memoria → Opciones avanzadas**. Está disponible solo como operación manual con permisos de administrador y un diálogo estándar **Cancelar / Confirmar limpieza**. Ya no hay que escribir `VACIAR`. La limpieza completa puede congelar Windows incluso si se ejecuta en otro proceso: no se recomienda como operación habitual, nunca queda programada y conserva la advertencia explícita antes de ejecutarse. La limpieza de baja prioridad tampoco garantiza mejoras de FPS.

En la tabla de procesos, **Seleccionar todos** marca las aplicaciones elegibles mostradas por el filtro actual. Excluye procesos de Windows protegidos y aplicaciones en primer plano. La ejecución conserva el límite de **8 procesos en modo conservador** o **30 en modo intensivo** por operación. Si Windows rechaza todas las limpiezas, VORTEX informa que ninguna se completó. La programación automática sigue desactivada por defecto y exige administrador.

El instalador NSIS conserva el `appId` `dev.vortex.optimizer`. Instalar una versión sobre otra puede reemplazarla sin preguntar expresamente «¿Desea reinstalar?». Cierra completamente VORTEX (incluida la bandeja del sistema), instala el nuevo Setup y comprueba el número de versión mostrado en la interfaz. No debes borrar los perfiles del usuario ni reinstalar Node.js o npm para utilizar la aplicación instalada.

## Nuevo en v0.79 — Perfil recomendado según juego y equipo

En **Modo juego**, selecciona un ejecutable y pulsa **Analizar equipo y juego**. VORTEX lee CPU, memoria total, memoria disponible, consumo conocido del proceso y número de GPU detectadas. Genera una propuesta conservadora e indica qué datos no pudo medir. Pulsa **Usar recomendación** para copiar la propuesta al editor; después decide si quieres **Guardar perfil** o **Aplicar perfil**. El análisis no modifica Windows por sí solo. No se prometen aumentos de FPS.

Un juego competitivo con protección antitrampas, como VALORANT, conserva prioridad CPU Normal y afinidad predeterminada. Cuando falta información suficiente, los ajustes delicados permanecen sin modificar. En equipos con pocos procesadores lógicos y CPU realmente exigida puede sugerirse prioridad Superior y ProBalance para lanzadores secundarios. Con RAM limitada puede sugerirse IdleSaver; **SmartTrim siempre comienza apagado**. La preferencia de GPU puede sugerirse si Windows identifica al menos dos adaptadores; requiere confirmación independiente y reiniciar el juego, y no garantiza que Windows use una GPU concreta.

**ProBalance, IdleSaver y SmartTrim** ahora aparecen como opciones configurables en Modo juego y Reglas. A diferencia de los perfiles anteriores, guardan sus umbrales e intervalos y pueden funcionar si se habilitan expresamente. Solo pueden actuar sobre un grupo reducido de lanzadores visibles y comprobables (`steamwebhelper`, `epicgameslauncher`, `epicwebhelper`, `goggalaxy`, `onedrive`); excluyen Chrome, el ejecutable del juego, procesos críticos y procesos en primer plano. ProBalance exige tres lecturas de CPU alta antes de bajar temporalmente la prioridad de un lanzador; IdleSaver espera a que esté inactivo; SmartTrim exige presión real de RAM y un intervalo mínimo entre recortes. Windows puede denegar las operaciones. Las prioridades temporales se intentan restaurar al perder el foco o terminar el perfil. No se restauran ajustes previamente realizados por otro software. El recorte de RAM puede provocar pausas; si ya experimentaste congelamientos, mantén SmartTrim desactivado.

Las automatizaciones globales siguen pausadas de forma predeterminada en Ajustes. Si activas manualmente un perfil con reglas de segundo plano, estas se supervisan durante ese perfil. Los perfiles guardados se conservan y pueden editarse sin reinstalar dependencias. En desarrollo, conservar `node_modules` está bien si el `package.json` mantiene las mismas dependencias; si cambian, ejecuta `npm install` una vez. La ventana de Electron se mantiene oculta hasta que el contenido tenga su primer renderizado para evitar mostrar un fondo gris vacío; el tiempo real de carga y la precisión de GPU aún requieren validación directa en Windows.

## Cambios v0.78 — Diagnóstico de rendimiento

Esta versión inicia con las optimizaciones automáticas pausadas, incluso si tienes reglas de otras versiones guardadas. Las configuraciones se conservan, pero no modifican procesos automáticamente hasta que actives **Ajustes → Protección del rendimiento → Optimizaciones automáticas**. Los cambios manuales siguen disponibles. Al desactivar las automatizaciones se intenta restaurar el perfil activo.

Se redujo la frecuencia de lectura pesada de procesos de aproximadamente una vez cada 1,35 s a una vez cada 4,5 s; la GPU se consulta a lo sumo una vez cada 12 s. Esto reduce la sobrecarga de PowerShell, a cambio de métricas menos instantáneas. La CPU/RAM general se sigue calculando con APIs de Node.js.

La prioridad de E/S **Alta** ahora puede seleccionarse. Se envía a Windows con nivel nativo 3 y se verifica leyendo el valor real. Windows puede rechazar el ajuste o normalizarlo; en tal caso, VORTEX indicará que no se aplicó. No se soporta prioridad Crítica y no se forzarán privilegios internos.

El archivo `herramientas/limpiar-standby.cmd` ahora comprueba los permisos y solicita elevación UAC cuando se ejecuta sin administrador. Abre una ventana visible para mostrar el resultado; no garantiza que la limpieza tenga éxito. Ejecuta solo la limpieza de baja prioridad. No se recomienda vaciar toda la caché de Windows por el riesgo de pausas.

Si el equipo continúa lento incluso con automatizaciones pausadas, revisa las reglas de programas externos, el historial de servicios y los ajustes de Windows: pausar VORTEX no revierte cambios hechos previamente a los servicios del sistema.

## Instalación y ejecución

Necesitas Windows 10/11, Node.js 22 o 24 LTS, npm y PowerShell 5.1.

```powershell
npm install
npm run dev
```

Pruebas y compilación:

```powershell
npm test
npm run build
npm run dist
```

`npm run dist` genera un instalador en la carpeta `release`, siempre que se ejecute desde Windows con las dependencias instaladas. Instala esa versión si quieres activar «Inicio con Windows»; iniciar únicamente Electron desde `npm run dev` no es adecuado para configurar el arranque, ya que depende del servidor Vite.

## Corrección urgente del Modo juego — v0.77

En versiones anteriores, ProBalance e IdleSaver podían reducir la prioridad del mismo juego que VORTEX intentaba acelerar. También podían recortar memoria del juego mediante SmartTrim. Ese comportamiento se ha eliminado para cualquier perfil activo del Modo juego.

Si el juego deja de ser la ventana activa, por ejemplo al abrir el Administrador de tareas, VORTEX no reducirá su prioridad. Los perfiles automáticos antiguos con prioridad Baja o Inferior se aplicarán como Normal. Si la prioridad ya estaba baja antes de activar el perfil, al restaurarlo se utilizará Normal en vez de dejarlo degradado. En v0.79 estas tres funciones se pueden guardar, pero solo afectan a un conjunto limitado de lanzadores secundarios y nunca al proceso del juego; por defecto se recomiendan desactivadas salvo que el análisis justifique alguna.

Para comprobarlo, cierra por completo VORTEX anterior desde el icono de la bandeja, abre la nueva versión, busca el ejecutable real del juego, comprueba que la prioridad sea Normal y luego utiliza «Modo juego → Verificar en Windows». Los juegos con sistemas antitrampas pueden impedir modificar la prioridad. No se recomienda prioridad «Tiempo real» ni ajustar la afinidad sin necesidad.

## Reglas de procesos — v0.75

En el menú lateral, abre **Reglas de procesos**. Se muestran todos los perfiles que VORTEX ya guardó en `game-rules.json`, aunque las aplicaciones correspondientes no estén abiertas. También puedes abrir la pantalla desde **Modo juego → Ver reglas guardadas**. No se leen ni importan automáticamente las reglas de Process Lasso u otras aplicaciones.

La lista incluye la coincidencia del ejecutable, su estado, la prioridad de CPU, afinidad, ajustes de GPU, E/S, memoria, EcoQoS e impulso de hilos, así como la activación automática. Puedes buscar y filtrar, abrir el editor con doble clic, usar clic derecho para duplicar o eliminar y crear una regla nueva sin abrir el juego.

La coincidencia por nombre (`juego.exe`) funciona para procesos con ese nombre. Una ruta completa (`C:\\Juegos\\juego.exe`) necesita coincidir exactamente con la ruta real proporcionada por Windows; si el sistema impide leerla, la regla por ruta no se aplicará. Las reglas por ruta tienen preferencia sobre las generales por nombre.

Las reglas anteriores siguen en la misma carpeta de datos del usuario de Electron. Guardar una regla no modifica el proceso inmediatamente. La aplicación automática solo funciona con VORTEX abierto y sigue limitada a un perfil activo a la vez; por tanto, una regla puede estar guardada o detectar un proceso sin estar aplicada. Las restricciones a procesos críticos, afinidad y prioridades peligrosas siguen activas.

La lista muestra el estado de configuración de VORTEX; no equivale a comprobar que Windows aceptó cada cambio. Para verificar los valores de un proceso, usa **Modo juego → Comprobar ajustes reales**.


## Novedades 0.7.2 (versión visible: 0.72)

En **Modo juego → Perfil del proceso** puedes guardar y modificar el modo de alta eficiencia, el impulso dinámico de hilos y la preferencia de GPU por ejecutable, junto con el resto de prioridades.

El panel **Comprobar ajustes reales** vuelve a leer los valores directamente desde Windows después de aplicarlos y muestra cuando no coinciden, faltan permisos o el controlador no responde. La opción de preferencia de GPU comprueba lo almacenado por Windows, **no** qué chip gráfico está renderizando el juego. Hay que reiniciar el juego para solicitar esa preferencia. El método de registro utilizado es experimental; para administrarlo manualmente, Windows 11 ofrece **Configuración → Sistema → Pantalla → Gráficos**.

**Impulso dinámico de hilos** controla una capacidad temporal del planificador de Windows para todos los hilos de un proceso. No equivale a subir permanentemente su prioridad ni asegura una ganancia de FPS. El **modo eficiente (EcoQoS)** está pensado principalmente para procesos en segundo plano; activarlo en un juego exigente puede reducir el rendimiento.

Cuando una prioridad avanzada no se puede consultar o confirmar, VORTEX mostrará un error y no la marcará como aplicada. Los procesos protegidos o con antitrampas pueden rechazar modificaciones. Los ajustes experimentales de GPU/E/S y EcoQoS deben validarse con Windows real: las pruebas del repositorio usan simulaciones y no sustituyen esa comprobación.

## Novedades 0.7.1 (versión visible: 0.71)

### Protección contra bloqueos al limpiar standby

En la versión 0.7.1 se desactivó temporalmente la limpieza completa. Desde la v0.75 está disponible nuevamente solo como opción manual avanzada, con confirmación explícita. Las programaciones antiguas de vaciado completo siguen desactivándose automáticamente. El modo automático solo se ejecuta bajo presión de memoria y con un volumen de caché de baja prioridad entre 64 y 512 MB. En manual se puede optar por omitir las recomendaciones bajo confirmación. El modo automático no se ejecuta con un perfil de juego activo ni durante la espera mínima de una hora. Si no se cumplen las condiciones, VORTEX explica por qué no hace nada. No hay garantías de que el vaciado de baja prioridad no provoque pausas.

Los intervalos admitidos son desde 60 minutos hasta 12 horas. La limpieza standby, aunque sea de baja prioridad, sigue siendo una operación experimental de Windows; la programación permanece desactivada de forma predeterminada. Para un equipo que funciona con normalidad, lo mejor es no vaciar esta caché.

### Minimizar junto al reloj de Windows

En **Ajustes → Minimizar a la bandeja** puedes activar o desactivar la minimización automática. Al minimizar, VORTEX se oculta en el área de notificaciones del sistema y continúa ejecutando sus perfiles activos. Usa el icono de VORTEX junto al reloj para restaurar la ventana, o abre su menú con clic derecho y selecciona **Salir** para cerrar el programa. El botón X cierra la aplicación normalmente.

En **Opciones** también aparece **Minimizar a la bandeja** para ocultarla inmediatamente, incluso si la preferencia está desactivada.

**Importante:** la interfaz de Electron, el icono de la bandeja y las llamadas nativas de Windows todavía requieren una validación real en Windows. Las pruebas unitarias no sustituyen esa validación.

## Novedades 0.7.0

Esta versión actualiza la numeración del proyecto y conserva todas las funciones de VORTEX 0.6.1 sin modificaciones funcionales.

## Novedades 0.6.1

- Acceso a **Ajustes** en la parte superior izquierda junto al logo de VORTEX.
- Menú **Opciones** en la esquina superior derecha, reemplazando el indicador «Windows conectado».
- Accesos rápidos a ajustes, servicios, caché standby, seguridad e historial desde el menú.
- Solicitud de permisos elevados desde **Opciones → Activar administrador**. Windows muestra UAC cuando corresponde.
- El estado de administrador se muestra dentro del menú. No se solicitan permisos sin intervención del usuario.
- Se mantienen los perfiles, las herramientas de memoria y las funciones de juego de la versión anterior.

## Novedades 0.6.0

### Métricas por aplicación

En «Memoria RAM» verás CPU, RAM en MB, RAM % y GPU para los procesos agrupados por nombre de ejecutable. Chrome y otras aplicaciones con procesos auxiliares ya no se representan únicamente con su proceso principal. Cada 2 segundos se solicita una lectura del sistema; el porcentaje de CPU se calcula a partir de la diferencia entre tiempos de CPU acumulados, normalizada por todos los procesadores lógicos. La primera muestra no permite calcular un porcentaje y aparece como «—».

RAM % equivale a RAM residente estimada del grupo dividido entre la RAM física del equipo. VORTEX usa el working set, que puede incluir páginas compartidas; el Administrador de tareas utiliza distintas definiciones según la vista. Por eso ambos valores pueden diferir. Las cifras agrupadas no deben sumarse para obtener el consumo total del sistema.

GPU es un valor aproximado calculado con los contadores `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine` si Windows y el controlador los exponen. Los datos se leen cada cuatro segundos aproximadamente. VORTEX agrega los procesos de una aplicación; puede diferir del Administrador de tareas y no mide VRAM dedicada. Cuando no hay datos disponibles, aparece «—», nunca un cero inventado.

La pantalla «Modo juego» también muestra CPU, RAM %, memoria y GPU por aplicación, mientras que prioridades y afinidad continúan actuando sobre el PID seleccionado.

### Supervisión automática de RAM

En «Memoria RAM» puedes definir qué aplicaciones se supervisan y el porcentaje **de memoria utilizada** a partir del cual VORTEX intentará reducir los working sets. Puedes configurar 80 %, 85 %, 90 %, 95 % y otros valores, además del intervalo de comprobación.

El sistema no cierra procesos automáticamente; evita los procesos críticos, las aplicaciones de primer plano y el proceso gestionado por el Modo juego. Solo funciona mientras la aplicación esté abierta y la configuración se mantiene en los datos locales entre ejecuciones.

### Programador de caché standby

En «Caché standby» solo está disponible la limpieza restringida de baja prioridad y, a partir de la versión 0.7.1, los intervalos deben ser de al menos 60 minutos. La operación real necesita permisos de administrador y puede fallar en función de Windows; los permisos no se elevan automáticamente.

**Aviso:** Windows normalmente reutiliza la memoria standby cuando la necesita. Limpiarla periódicamente puede empeorar la carga de juegos o programas. Esta opción es experimental y se recomienda mantenerla desactivada salvo que se esté diagnosticando un problema concreto.

### Perfiles persistentes

Las pantallas de Memoria RAM y Caché standby comparten perfiles. Puedes ponerles nombre, guardarlos y cargarlos; incluyen el umbral RAM, procesos supervisados, intervalo, tipo de caché y programación. Los archivos se guardan localmente dentro de la carpeta de datos de usuario de Electron, no en el proyecto. Límite: 20 perfiles guardados.

### Inicio con Windows y administrador

En el menú «Inicio con Windows» puedes activar el arranque automático **de la aplicación instalada**. También se indica el estado de elevación y puedes pulsar «Activar administrador» para solicitar privilegios UAC. Activar el inicio de sesión automático no concede privilegios de administrador. No se modifica UAC ni se ejecuta una tarea administrativa en segundo plano.

Si activas una supervisión o purga programada, VORTEX debe permanecer abierto para ejecutar sus intervalos. Al cerrar la aplicación se detienen las tareas; al abrirla otra vez se restaura la programación guardada.

## Limitaciones

La interfaz y las operaciones sobre el sistema deben verificarse en Windows. Los permisos, controladores, contadores de GPU, exclusiones de antivirus y versiones de PowerShell pueden influir en los resultados. No se promete aumento de FPS ni capacidad de liberar toda la RAM. Desactivar servicios esenciales y modificar integridad de memoria no forma parte de la optimización automática.


## Versión 0.74 — Cambios principales

- Mensajes de error breves en español. Los detalles técnicos se conservan en `vortex-errors.log` dentro de la carpeta de datos de la aplicación.
- Preferencia de GPU: consulta alternativa del ejecutable mediante Win32_Process si Windows no devuelve la ruta por Get-Process.
- Panel principal: CPU del equipo por diferencia entre muestras y GPU aproximada mediante contadores disponibles de Windows, con actualizaciones cada 2 segundos. Si la lectura de GPU no está disponible, muestra `—` en vez de cero.
- Perfiles de juego: botones de **Guardar perfil** y **Aplicar perfil** al principio del editor. Reglas: botón **Guardar** también en el encabezado.
- Memoria RAM y caché standby: los perfiles guardados están situados arriba. La limpieza standby manual de baja prioridad puede intentarse aunque haya RAM disponible. Esta versión antigua mantenía restricciones que ahora pueden omitirse manualmente en v0.75 mediante confirmación.
- Ajustes: sección **Actualizar VORTEX**, con búsqueda, descarga e instalación de actualizaciones publicadas.

## Actualizaciones para usuarios finales

La actualización automática **no funciona en `npm run dev`** ni si el instalador no fue compilado con un canal de publicaciones. Requiere **Electron Updater**, el instalador **NSIS** y publicar el `.exe` y `latest.yml` en el mismo GitHub Release o proveedor HTTPS. Se incluye `.github/workflows/publicar.yml` para generar una publicación al subir una etiqueta `v*` al repositorio público de GitHub.

1. Crea un repositorio público de GitHub con el proyecto. Coloca la carpeta `vortex` como raíz del repositorio.
2. En tu equipo, ejecuta `npm install`, `npm test` y `npm run dist` para realizar pruebas locales de instalación.
3. Asegúrate de que la versión de `package.json` coincide con la etiqueta de publicación, por ejemplo `0.7.5` y `v0.7.5`.
4. Publica el código en GitHub y sube una etiqueta con `git tag v0.7.5` y `git push origin v0.7.5`. La acción construye el instalador y publica sus metadatos.
5. Instala una vez el programa **desde ese Release**. Las próximas versiones que publiques (0.7.5, etc.) podrán descargarse desde **Ajustes → Actualizar VORTEX**, sin pasarles nuevamente el instalador manualmente.

**Importante:** las instalaciones de VORTEX 0.73 y anteriores no incluyen este sistema y necesitarán instalar la primera versión que sí lo incorpore. Las actualizaciones empaquetadas requieren probarse en Windows antes de distribuirlas; para uso público conviene firmar los ejecutables y realizar despliegues por etapas. La actualización se instala con reinicio voluntario, no de manera silenciosa mientras el usuario juega.

Para builds locales con un canal HTTPS propio, define `VORTEX_UPDATE_URL` en el entorno de compilación antes de ejecutar `npm run dist`. Se debe utilizar una URL HTTPS real que entregue `latest.yml` y los archivos NSIS correspondientes. No agregues tokens privados al código del cliente.

### Diagnóstico

Si ves datos de GPU distintos al Administrador de tareas, ten presente que los valores son **aproximaciones por motores GPU**, no lecturas directas del Administrador de tareas. No se muestran valores cuando Windows no expone contadores compatibles. El código de VORTEX se ejecuta y valida con `npm test`; para comprobar su integración visual hay que abrir la app en Windows con Electron.


## Limpieza standby externa (v0.75)

La aplicación lanza `src/main/helpers/standby-cleaner.ps1` en un proceso independiente de PowerShell. En la versión instalada, el script se empaqueta en `resources/helpers/standby-cleaner.ps1`. No se requiere descargar ejecutables de terceros.

La limpieza manual permite elegir **Baja prioridad** o **Toda la lista standby**. La segunda opción es experimental y requiere escribir `VACIAR`. También puedes forzar manualmente el modo de baja prioridad cuando las recomendaciones indican esperar. Ambas operaciones requieren que VORTEX esté ejecutándose como administrador.

La limpieza programada conserva restricciones de seguridad y nunca vacía toda la lista standby. Una operación externa puede mantener la interfaz de VORTEX responsiva, pero **no garantiza que Windows no se congele**: el propio sistema puede pasar tiempo recargando la caché desde el disco. Si ya experimentaste congelamientos, evita utilizar la limpieza completa.

Para usar la opción externa manual desde una consola abierta como administrador, también puedes ejecutar `herramientas\limpiar-standby.cmd`. Este archivo usa únicamente baja prioridad; la limpieza completa requiere confirmación dentro de VORTEX. No ejecutes manualmente el script en un equipo que no sea Windows. No se han validado las llamadas nativas a Windows desde este entorno de desarrollo.


## Inicio más rápido (v0.77)

VORTEX ahora abre el panel sin esperar al inventario completo de servicios de Windows ni a la consulta HVCI. Las secciones Servicios y Seguridad consultan sus datos al abrirse; el hardware adicional se obtiene después de mostrar la ventana. El panel de CPU y RAM no se bloquea esperando a la GPU; la consulta de GPU se ejecuta de forma separada y muestra una estimación cuando está disponible. El gestor de juegos comienza a vigilar reglas unos segundos después de arrancar, sin modificar las reglas guardadas.

Para actualizar, reemplaza los archivos del proyecto sin borrar `node_modules` y ejecuta `npm run dev`. Si Vite demora en arrancar después de copiar archivos, cierra todos los procesos de VORTEX y prueba a eliminar solamente la caché `node_modules/.vite`, no las dependencias.

Las pruebas unitarias no sustituyen la comprobación del tiempo de apertura en Windows. Si el servidor Vite tarda antes de que aparezca la ventana, esa demora corresponde al entorno de desarrollo, no a la consulta de servicios.
