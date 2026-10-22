# Cambios de VORTEX

## v0.80 — Limpiar memoria integrado

- Eliminado el apartado separado «Caché standby» y añadida su funcionalidad a «Memoria RAM».
- Botón principal «Limpiar memoria» conservador; opción avanzada para vaciar la lista completa con confirmación visual, sin escribir palabras.
- Programación de limpieza de baja prioridad en la misma pantalla, configurable por intervalos y guardable en perfiles de memoria.
- Nuevo botón «Seleccionar todos» que respeta búsqueda y excluye procesos protegidos y en primer plano.
- Mensajes de ejecución informan cuántos procesos pudieron limpiarse y muestran fallo si ninguno se procesó.
- Identificador de instalador NSIS estable para instalación sobre versiones anteriores; visualización de versión 0.80.
- Limpieza completa solo manual; sin cambios en las protecciones frente a ejecuciones programadas peligrosas.
- Dependencias npm sin cambios respecto de la versión anterior.

## v0.79 — Perfil por equipo y juego

- Nuevo botón **Analizar equipo y juego** que propone prioridad, preferencia GPU, ProBalance e IdleSaver según hardware y mediciones disponibles.
- La recomendación solo rellena el editor; guardarla y aplicarla siguen siendo operaciones separadas y manuales.
- SmartTrim se propone desactivado. Si el usuario lo activa, requiere condiciones de memoria y tiempo de espera.
- Opciones de ProBalance, IdleSaver y SmartTrim recuperadas en Modo juego y editor de Reglas, con parámetros editables.
- Supervisión de segundo plano limitada a cinco ejecutables secundarios; excluye juego, Chrome y sistema.
- Restauración condicional de prioridades temporales cuando el juego pierde el foco o el perfil termina.
- Las automatizaciones globales permanecen desactivadas por defecto.
- La ventana de Electron se muestra tras el primer renderizado para evitar enseñar el fondo gris inicial; pendiente de validación en Windows.
- Pruebas de recomendaciones, exclusiones, carga sostenida, límites de SmartTrim y restauración de prioridad.
- Versión interna 0.7.9, versión visible 0.79. Dependencias npm sin cambios.

## v0.78 — Modo de observación y diagnóstico

- Las automatizaciones arrancan pausadas hasta que el usuario las habilite manualmente en Ajustes.
- Al pausar automatizaciones, se detienen los temporizadores de reglas, limpieza de RAM y standby, y se intenta restaurar el perfil activo.
- Menos lecturas de PowerShell para evitar la sobrecarga de monitorización.
- Prioridad de E/S Alta disponible como experimento, con lectura de confirmación y error si Windows la rechaza.
- CMD de standby con solicitud de elevación UAC y resultados visibles.
- Se conserva el historial y las configuraciones de versiones anteriores.

# Cambios de VORTEX

## v0.77 — Inicio optimizado

- El panel principal no espera a consultar cientos de servicios ni HVCI.
- Inventario de servicios e integridad de memoria cargados únicamente al abrir sus pantallas.
- Información adicional de GPU y edición de Windows obtenida sin bloquear el inicio.
- Lecturas de CPU/RAM rápidas, separadas de las consultas de GPU.
- Supervisión de reglas de juegos diferida durante los primeros segundos.
- Las reglas, perfiles y opciones anteriores se conservan sin modificar.
- No se altera el comportamiento de la limpieza de RAM ni la caché standby.

# VORTEX v0.76

- Corrección: ProBalance e IdleSaver ya no bajan la prioridad del juego activo al perder el foco.
- Corrección: SmartTrim deja de intervenir en la memoria del juego protegido.
- Los perfiles nuevos no conservan opciones de moderación incompatibles con el Modo juego.
- Una regla guardada con prioridad baja se normaliza a Normal al aplicar el Modo juego y al volver a guardarla.
- Si el juego estaba por debajo de Normal antes de activarse, la restauración final devuelve Normal.
- La supervisión solo consulta el estado real; no modifica prioridades, afinidades ni memoria del juego.
- Añadidas pruebas de regresión para pérdidas de foco y perfiles antiguos.
- Versión visible 0.76; versión interna 0.7.6.

# VORTEX v0.75

- Motor standby separado mediante proceso externo de PowerShell.
- Botones manuales para lista de baja prioridad y lista completa.
- Confirmación explícita para ejecutar sin las restricciones habituales.
- Limpieza automática conservadora y limitada a la lista de baja prioridad.
- El script auxiliar se incluye en el paquete de instalación.
- Se conservan perfiles, servicios, modo juego, ajustes y otras funciones de versiones anteriores.

# VORTEX 0.74

- Actualizador de versiones NSIS con canal publicable mediante GitHub Releases o un servidor HTTPS.
- Sección de actualizaciones en Ajustes con descarga y reinicio a elección del usuario.
- Mensajes cortos para errores de Windows y PowerShell CLIXML. Detalle técnico guardado localmente.
- Consulta alternativa de rutas de ejecutables para la preferencia de GPU.
- Panel principal actualizado cada dos segundos: CPU por diferencias de contadores y GPU estimada o no disponible.
- Perfiles de juegos y memoria al comienzo de los paneles; botón de guardar en cabecera del editor de reglas.
- Limpieza manual standby de baja prioridad con confirmación y los límites de seguridad anteriores.

---

# Cambios de VORTEX

## 0.7.3

- Nueva pantalla «Reglas de procesos» con tabla de perfiles guardados, estados y configuración de CPU, GPU, afinidad, E/S, memoria, eficiencia e impulso de hilos.
- Nuevas acciones para crear, editar, duplicar y eliminar reglas; aplicación automática por ejecutable y búsqueda y filtros.
- Los perfiles anteriores se mantienen en `game-rules.json`; no se importan reglas de otras aplicaciones.
- Compatibilidad con coincidencia por nombre o por ruta exacta de ejecutable. Las reglas específicas por ruta tienen prioridad.
- Acceso desde el menú lateral, Opciones y Modo juego, manteniendo el diseño sobrio estilo Windows 11.
- Versión interna `0.7.3`, versión visible `0.73`.

## 0.7.2

- Nuevo selector **Modo de alta eficiencia** por proceso. Permite consultar y solicitar EcoQoS, alto rendimiento o devolver el control a Windows. La lectura posterior usa `GetProcessInformation`.
- Nuevo **Impulso dinámico de hilos** por proceso, con opciones Permitir y Desactivar. Se aplica con `SetProcessPriorityBoost` y se comprueba con `GetProcessPriorityBoost`. Afecta a los hilos del proceso, pero no asigna prioridades fijas a cada hilo.
- Nueva **Preferencia de GPU por ejecutable** con las opciones Windows decide, Ahorro y Alto rendimiento. Se escribe en las preferencias gráficas de Windows del usuario actual, se lee nuevamente y exige reiniciar el juego. El controlador puede no usar la GPU deseada. No se activa automáticamente por el mero hecho de guardar un perfil.
- Nuevo panel **Comprobar ajustes reales**, con lectura de prioridad de CPU, afinidad, GPU, E/S, memoria, eficiencia, impulso de hilos y preferencia de GPU. Muestra discrepancias y errores cuando una API no responde.
- Los ajustes avanzados de perfiles ahora comprueban su valor después de aplicar cada cambio. Si la comprobación falla, no se anuncia éxito y se intenta restaurar la configuración anterior.
- La supervisión del juego registra el último error visible para diagnosticar las reglas que no llegaron a aplicarse.
- ProBalance usa el porcentaje de un núcleo lógico de CPU para su umbral, en lugar del porcentaje normalizado entre todos los núcleos.
- Se conservan las restricciones sobre la limpieza standby introducidas en 0.7.1.
- Versión técnica `0.7.2`, etiqueta visible `0.72`.

La preferencia de GPU por registro es una opción experimental y no una API pública de Windows; el ajuste respaldado por Microsoft se encuentra en **Configuración → Sistema → Pantalla → Gráficos**. Esta opción no cambia la GPU de un proceso en ejecución. Los estados nativos requieren validación en Windows 10/11 sobre distintos equipos. La aplicación no aumenta ni fuerza la frecuencia de GPU o CPU.

## 0.7.1

- Protección reforzada después de congelamientos al utilizar la limpieza completa de caché standby.
- Vaciado completo deshabilitado, también para configuraciones programadas antiguas.
- Limpieza de baja prioridad condicionada a presión de RAM, tamaño máximo y mínimo de caché y ausencia de un perfil de juego activo.
- Intervalo mínimo de 60 minutos entre limpiezas y ejecución programada solo bajo presión de memoria.
- Modo bandeja del sistema: minimizar, restaurar desde el icono y salir desde el menú.
- Interruptor de bandeja en Ajustes y acción rápida en el menú Opciones.
- Versión interna 0.7.1 y etiqueta visible 0.71.

## 0.7.0

- Se actualizó la versión del proyecto y la etiqueta visible a 0.7.0.
- Se conservaron las funcionalidades de la versión 0.6.1.

## 0.6.1

- Ajustes movido a la parte superior izquierda junto a VORTEX.
- Menú Opciones con accesos a herramientas y Activar administrador.
- Eliminado el indicador Windows conectado en la cabecera.
- Menú desplegable accesible mediante teclado (Escape y clic fuera).

## 0.6.0

- Supervisión automática configurable cuando la RAM en uso alcanza porcentajes como 80 %, 85 %, 90 % o 95 %.
- Persistencia local de la supervisión y de la programación standby.
- Programación de caché standby cada 15 minutos, una hora o intervalos superiores, con confirmación para limpieza completa.
- Perfiles con nombre que combinan configuración de RAM y caché standby.
- Sección independiente «Inicio con Windows» con control de arranque y solicitud de privilegios de administrador.
- Tabla de CPU, RAM, RAM % y GPU agrupada por ejecutable, para reflejar mejor navegadores y aplicaciones multiproceso.
- Cálculo de CPU usando dos muestras de tiempo de CPU acumulado y contadores opcionales de GPU de Windows.
- Nuevas pruebas para agrupación de procesos, GPU, umbrales y perfiles locales.
- Diseño oscuro plano y en español conservado.

## 0.5.0

- Perfiles de Modo juego con prioridades avanzadas y reglas ProBalance, SmartTrim e IdleSaver.
- Solicitud de elevación y controles para caché standby.
