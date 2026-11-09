const home = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion';
const explorer = `${home}\\Explorer\\Advanced`;
const personalize = `${home}\\Themes\\Personalize`;
const desktop = 'HKCU:\\Control Panel\\Desktop';
const search = `${home}\\Search`;
const delivery = `${home}\\ContentDeliveryManager`;
const searchSettings = `${home}\\SearchSettings`;
const windowsPolicy = 'HKCU:\\Software\\Policies\\Microsoft\\Windows';

export const extraTweaks = Object.freeze([
  { id: 'dark-mode', category: 'Personalizacion', title: 'Modo oscuro en aplicaciones', description: 'Utiliza el tema oscuro de Windows para las aplicaciones compatibles.', restart: 'Puede requerir reiniciar algunas aplicaciones.', values: [{ path: personalize, name: 'AppsUseLightTheme', type: 'DWord', on: 0, off: 1 }] },
  { id: 'taskbar-left', category: 'Personalizacion', title: 'Barra de tareas a la izquierda', description: 'Alinea el menu Inicio y los iconos en Windows 11.', restart: 'Puede requerir reiniciar el Explorador.', values: [{ path: explorer, name: 'TaskbarAl', type: 'DWord', on: 0, off: 1 }] },
  { id: 'taskview-hide', category: 'Personalizacion', title: 'Ocultar Vista de tareas', description: 'Oculta el boton de Vista de tareas de la barra.', values: [{ path: explorer, name: 'ShowTaskViewButton', type: 'DWord', on: 0, off: 1 }] },
  { id: 'widgets-hide', category: 'Personalizacion', title: 'Ocultar Widgets', description: 'Oculta Widgets de la barra de tareas en versiones compatibles.', values: [{ path: explorer, name: 'TaskbarDa', type: 'DWord', on: 0, off: 1 }] },
  { id: 'clock-seconds', category: 'Personalizacion', title: 'Mostrar segundos en el reloj', description: 'Muestra los segundos en la bandeja de Windows 11.', values: [{ path: explorer, name: 'ShowSecondsInSystemClock', type: 'DWord', on: 1, off: 0 }] },
  { id: 'extensions', category: 'Personalizacion', title: 'Mostrar extensiones de archivos', description: 'Permite distinguir archivos como .exe, .txt y .pdf.', values: [{ path: explorer, name: 'HideFileExt', type: 'DWord', on: 0, off: 1 }] },
  { id: 'menu-speed', category: 'Escritorio', title: 'Menus mas rapidos', description: 'Reduce el retraso al abrir menus de Windows sin modificar la velocidad del procesador.', restart: 'Puede requerir cerrar sesion.', values: [{ path: desktop, name: 'MenuShowDelay', type: 'String', on: '100', off: '400' }] },
  { id: 'end-task', category: 'Escritorio', title: 'Finalizar tarea desde la barra', description: 'Muestra Finalizar tarea en el menu contextual de aplicaciones compatibles.', values: [{ path: explorer.replace('\\Explorer\\Advanced', '\\Explorer\\Advanced\\TaskbarDeveloperSettings'), name: 'TaskbarEndTask', type: 'DWord', on: 1, off: 0 }] },
  { id: 'game-mode', category: 'Juegos', title: 'Modo juego de Windows', description: 'Solicita el modo juego del sistema; no garantiza mas FPS.', values: [{ path: 'HKCU:\\Software\\Microsoft\\GameBar', name: 'AutoGameModeEnabled', type: 'DWord', on: 1, off: 0 }] },
  { id: 'game-capture', category: 'Juegos', title: 'Desactivar grabacion en segundo plano', description: 'Evita la captura automatica de Game DVR. Puede impedir grabaciones que utilices.', values: [{ path: `${home}\\GameDVR`, name: 'AppCaptureEnabled', type: 'DWord', on: 0, off: 1 }, { path: 'HKCU:\\System\\GameConfigStore', name: 'GameDVR_Enabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'mouse-acceleration', category: 'Juegos', title: 'Desactivar aceleracion del mouse', description: 'Usa movimiento sin aceleracion clasica de Windows, util para quienes prefieren sensibilidad constante.', restart: 'Puede requerir cerrar sesion.', values: [{ path: 'HKCU:\\Control Panel\\Mouse', name: 'MouseSpeed', type: 'String', on: '0', off: '1' }, { path: 'HKCU:\\Control Panel\\Mouse', name: 'MouseThreshold1', type: 'String', on: '0', off: '6' }, { path: 'HKCU:\\Control Panel\\Mouse', name: 'MouseThreshold2', type: 'String', on: '0', off: '10' }] },
  { id: 'lockscreen-tips', category: 'Privacidad', title: 'Quitar sugerencias de pantalla de bloqueo', description: 'Reduce recomendaciones y contenido promocional en la pantalla de bloqueo.', values: [{ path: `${home}\\ContentDeliveryManager`, name: 'RotatingLockScreenOverlayEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'suggestions', category: 'Privacidad', title: 'Reducir sugerencias de Windows', description: 'Desactiva parte de las recomendaciones y sugerencias de aplicaciones.', values: [{ path: `${home}\\ContentDeliveryManager`, name: 'SoftLandingEnabled', type: 'DWord', on: 0, off: 1 }, { path: `${home}\\ContentDeliveryManager`, name: 'SubscribedContent-338388Enabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'system-dark', category: 'Personalizacion', title: 'Modo oscuro del sistema', description: 'Usa el tema oscuro tambien en el escritorio y los menus compatibles.', values: [{ path: personalize, name: 'SystemUsesLightTheme', type: 'DWord', on: 0, off: 1 }] },
  { id: 'clock-24h', category: 'Personalizacion', title: 'Reloj en formato de 24 horas', description: 'Usa el formato de 24 horas en el reloj y algunas aplicaciones. El formato previo se guarda.', values: [{ path: 'HKCU:\\Control Panel\\International', name: 'sShortTime', type: 'String', on: 'HH:mm', off: 'h:mm tt' }] },
  { id: 'hidden-files', category: 'Personalizacion', title: 'Mostrar archivos ocultos', description: 'Muestra archivos y carpetas ocultos en el Explorador. No revela archivos protegidos del sistema.', values: [{ path: explorer, name: 'Hidden', type: 'DWord', on: 1, off: 2 }] },
  { id: 'this-pc', category: 'Personalizacion', title: 'Abrir Este equipo en el Explorador', description: 'Cambia la pagina inicial del Explorador a Este equipo.', values: [{ path: explorer, name: 'LaunchTo', type: 'DWord', on: 1, off: 2 }] },
  { id: 'explorer-full-path', category: 'Personalizacion', title: 'Ruta completa en ventanas del Explorador', description: 'Muestra la ruta completa donde la version de Windows lo permita.', values: [{ path: `${home}\\Explorer\\CabinetState`, name: 'FullPath', type: 'DWord', on: 1, off: 0 }] },
  { id: 'explorer-status-bar', category: 'Personalizacion', title: 'Barra de estado del Explorador', description: 'Muestra la barra de estado en las vistas del Explorador compatibles.', values: [{ path: explorer, name: 'ShowStatusBar', type: 'DWord', on: 1, off: 0 }] },
  { id: 'taskbar-search-hide', category: 'Personalizacion', title: 'Ocultar busqueda en la barra de tareas', description: 'Oculta el cuadro o boton de busqueda en versiones de Windows compatibles.', values: [{ path: search, name: 'SearchboxTaskbarMode', type: 'DWord', on: 0, off: 2 }] },
  { id: 'search-highlights', category: 'Personalizacion', title: 'Desactivar destacados de busqueda', description: 'Evita ilustraciones y sugerencias destacadas del buscador de Windows.', values: [{ path: searchSettings, name: 'IsDynamicSearchBoxEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-shake', category: 'Escritorio', title: 'Desactivar Aero Shake', description: 'Impide que sacudir una ventana minimice las demas. Solo cambia el escritorio.', values: [{ path: `${windowsPolicy}\\Explorer`, name: 'NoWindowMinimizingShortcuts', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-snap-flyout', category: 'Escritorio', title: 'Ocultar diseños al maximizar', description: 'Oculta las sugerencias Snap Layouts al colocar el cursor sobre maximizar en Windows 11.', values: [{ path: explorer, name: 'EnableSnapAssistFlyout', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-snap-assist', category: 'Escritorio', title: 'Desactivar sugerencias de ajuste', description: 'Reduce las sugerencias al ajustar ventanas. Algunas versiones de Windows gestionan esto en Configuracion.', values: [{ path: explorer, name: 'SnapAssist', type: 'DWord', on: 0, off: 1 }] },
  { id: 'hide-recent-explorer', category: 'Escritorio', title: 'Ocultar archivos recientes en Inicio', description: 'Evita mostrar archivos recientes en la pagina principal del Explorador.', values: [{ path: `${home}\\Explorer`, name: 'ShowRecent', type: 'DWord', on: 0, off: 1 }] },
  { id: 'hide-frequent-explorer', category: 'Escritorio', title: 'Ocultar carpetas frecuentes', description: 'Oculta las carpetas utilizadas con frecuencia en la pagina principal del Explorador.', values: [{ path: `${home}\\Explorer`, name: 'ShowFrequent', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-recent-doc-tracking', category: 'Escritorio', title: 'No rastrear documentos recientes', description: 'Reduce el registro de archivos recientes para el usuario actual.', values: [{ path: explorer, name: 'Start_TrackDocs', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-app-tracking', category: 'Escritorio', title: 'No rastrear aplicaciones usadas', description: 'Reduce el seguimiento de aplicaciones frecuentes en el menu Inicio.', values: [{ path: explorer, name: 'Start_TrackProgs', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-notifications', category: 'Escritorio', title: 'Desactivar notificaciones emergentes', description: 'Oculta los avisos de aplicaciones. Puedes perder notificaciones importantes.', values: [{ path: `${home}\\PushNotifications`, name: 'ToastEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-clipboard-history', category: 'Privacidad', title: 'Desactivar historial del portapapeles', description: 'Desactiva el historial Win + V. No borra lo que ya fue sincronizado en otros dispositivos.', values: [{ path: 'HKCU:\\Software\\Microsoft\\Clipboard', name: 'EnableClipboardHistory', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-advertising-id', category: 'Privacidad', title: 'Desactivar ID de publicidad', description: 'Impide que las aplicaciones usen tu identificador de publicidad personalizado.', values: [{ path: `${home}\\AdvertisingInfo`, name: 'Enabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-tailored-experiences', category: 'Privacidad', title: 'Desactivar experiencias personalizadas', description: 'Reduce recomendaciones basadas en datos de diagnostico del dispositivo.', values: [{ path: `${home}\\Privacy`, name: 'TailoredExperiencesWithDiagnosticDataEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-search-web-suggestions', category: 'Privacidad', title: 'Desactivar sugerencias web en busqueda', description: 'Reduce sugerencias de Internet en la busqueda de Windows donde la directiva siga siendo compatible.', values: [{ path: `${windowsPolicy}\\Explorer`, name: 'DisableSearchBoxSuggestions', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-silent-app-suggestions', category: 'Privacidad', title: 'Evitar aplicaciones sugeridas silenciosamente', description: 'Desactiva parte de las aplicaciones promocionadas instaladas por recomendaciones de Windows.', values: [{ path: delivery, name: 'SilentInstalledAppsEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-explorer-app-suggestions', category: 'Privacidad', title: 'Ocultar sugerencias de aplicaciones', description: 'Reduce recomendaciones promocionales dentro del Explorador y areas compatibles.', values: [{ path: delivery, name: 'SystemPaneSuggestionsEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-typing-suggestions', category: 'Privacidad', title: 'Desactivar sugerencias al escribir', description: 'Desactiva sugerencias de texto para teclado fisico cuando Windows las admita.', values: [{ path: 'HKCU:\\Software\\Microsoft\\Input\\Settings', name: 'EnableHwkbTextPrediction', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-input-insights', category: 'Privacidad', title: 'Desactivar estadisticas de escritura', description: 'Reduce datos de personalizacion de entrada para el usuario actual.', values: [{ path: 'HKCU:\\Software\\Microsoft\\Input\\Settings', name: 'InsightsEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-background-store-apps', category: 'Rendimiento', title: 'Limitar aplicaciones Store en segundo plano', description: 'Restringe algunas aplicaciones de Microsoft Store. Puede afectar sincronizacion y avisos; depende de la version de Windows.', values: [{ path: `${home}\\BackgroundAccessApplications`, name: 'GlobalUserDisabled', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-fast-startup', category: 'Rendimiento', title: 'Desactivar inicio rapido', description: 'Evita el apagado hibrido. Puede alargar el arranque y requiere administrador.', restart: 'Puede requerir reiniciar Windows.', values: [{ path: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', name: 'HiberbootEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-gamebar-controller', category: 'Juegos', title: 'Evitar abrir Game Bar con el mando', description: 'Impide que el boton Xbox del mando abra la barra de juegos en Windows compatible.', values: [{ path: 'HKCU:\\Software\\Microsoft\\GameBar', name: 'UseNexusForGameBarEnabled', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-gamebar-tips', category: 'Juegos', title: 'Ocultar consejos de Xbox Game Bar', description: 'Evita parte de las sugerencias y avisos iniciales de Game Bar.', values: [{ path: 'HKCU:\\Software\\Microsoft\\GameBar', name: 'ShowStartupPanel', type: 'DWord', on: 0, off: 1 }] },
  { id: 'disable-copilot-legacy', category: 'IA', title: 'Desactivar Copilot integrado antiguo', description: 'Aplica la directiva del Copilot integrado en Windows. No desinstala ni bloquea necesariamente la nueva aplicacion Copilot.', values: [{ path: `${windowsPolicy}\\WindowsCopilot`, name: 'TurnOffWindowsCopilot', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-recall-snapshots', category: 'IA', title: 'Impedir capturas de Windows Recall', description: 'Directiva para impedir nuevas instantaneas de Recall en ediciones compatibles. Ojo: Windows podria eliminar instantaneas guardadas.', restart: 'Puede requerir reiniciar Windows. Las instantaneas anteriores podrian eliminarse.', values: [{ path: `${windowsPolicy}\\WindowsAI`, name: 'DisableAIDataAnalysis', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-consumer-features', category: 'Privacidad', title: 'Desactivar experiencias de consumidor', description: 'Directiva para reducir aplicaciones y contenido promocional. Puede requerir administrador y no funciona en todas las ediciones.', values: [{ path: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', name: 'DisableWindowsConsumerFeatures', type: 'DWord', on: 1, off: 0 }] },
  { id: 'disable-windows-spotlight', category: 'Privacidad', title: 'Reducir contenido Spotlight de Windows', description: 'Desactiva contenidos sugeridos de Windows Spotlight donde la directiva se aplique.', values: [{ path: `${windowsPolicy}\\CloudContent`, name: 'DisableWindowsSpotlightFeatures', type: 'DWord', on: 1, off: 0 }] }
]);

const cautionTweaks = new Set(['game-capture', 'mouse-acceleration', 'disable-notifications', 'disable-clipboard-history', 'disable-background-store-apps', 'disable-fast-startup', 'disable-recall-snapshots', 'disable-consumer-features', 'disable-snap-assist']);
const importantTweaks = new Set(['disable-fast-startup', 'disable-recall-snapshots', 'disable-consumer-features']);
const performanceTweaks = new Set(['menu-speed', 'disable-snap-assist', 'disable-background-store-apps', 'disable-fast-startup']);
const gamingTweaks = new Set(['game-mode', 'game-capture', 'mouse-acceleration', 'disable-gamebar-controller', 'disable-gamebar-tips']);
const recommendedTweaks = new Set(['extensions', 'game-mode', 'disable-advertising-id', 'disable-tailored-experiences', 'hidden-files']);

export function getTweakMeta(tweak) {
  if (!tweak) return null;
  const tags = [];
  if (performanceTweaks.has(tweak.id)) tags.push('performance');
  if (gamingTweaks.has(tweak.id)) tags.push('gaming');
  if (tweak.category === 'Privacidad') tags.push('privacy');
  if (tweak.category === 'IA') tags.push('ai');
  if (tweak.category === 'Personalizacion') tags.push('appearance');
  if (tweak.category === 'Escritorio') tags.push('general');
  if (recommendedTweaks.has(tweak.id)) tags.push('recommended');
  return { tags, risk: importantTweaks.has(tweak.id) ? 'high' : cautionTweaks.has(tweak.id) ? 'caution' : 'safe', requiresAdmin: tweak.values.some(x => x.path.startsWith('HKLM:')) };
}

export function getExtraTweak(id) {
  return extraTweaks.find(tweak => tweak.id === id) || null;
}

export function inferExtraTweakState(tweak, values) {
  if (!tweak || !Array.isArray(values) || values.length !== tweak.values.length || values.some(value => value === null || value === undefined)) return null;
  const equal = (value, expected) => String(value).toLowerCase() === String(expected).toLowerCase();
  if (values.every((value, index) => equal(value, tweak.values[index].on))) return true;
  if (values.every((value, index) => equal(value, tweak.values[index].off))) return false;
  return null;
}
