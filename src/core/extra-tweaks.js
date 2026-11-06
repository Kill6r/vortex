const home = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion';
const explorer = `${home}\\Explorer\\Advanced`;
const personalize = `${home}\\Themes\\Personalize`;
const desktop = 'HKCU:\\Control Panel\\Desktop';

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
  { id: 'suggestions', category: 'Privacidad', title: 'Reducir sugerencias de Windows', description: 'Desactiva parte de las recomendaciones y sugerencias de aplicaciones.', values: [{ path: `${home}\\ContentDeliveryManager`, name: 'SoftLandingEnabled', type: 'DWord', on: 0, off: 1 }, { path: `${home}\\ContentDeliveryManager`, name: 'SubscribedContent-338388Enabled', type: 'DWord', on: 0, off: 1 }] }
]);

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
