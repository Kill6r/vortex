import { app } from 'electron';

function getSettings() {
  if (process.platform !== 'win32') return { supported: false, enabled: false };
  if (!app.isPackaged) return { supported: true, enabled: false, packaged: false };
  const settings = app.getLoginItemSettings();
  return { supported: true, enabled: Boolean(settings.openAtLogin), packaged: true };
}

export function getStartupStatus() { return getSettings(); }
export function setStartupStatus(enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Selecciona activar o desactivar el inicio con Windows.');
  if (process.platform !== 'win32') throw new Error('Esta opción solo está disponible en Windows.');
  if (!app.isPackaged) throw new Error('Instala VORTEX con npm run dist para habilitar el inicio automático. La versión de desarrollo necesita Vite.');
  app.setLoginItemSettings({ openAtLogin: enabled });
  return getSettings();
}
