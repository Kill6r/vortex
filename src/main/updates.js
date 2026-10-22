import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export function createUpdateController(options = {}) {
  const packed = options.packaged ?? app.isPackaged;
  const configured = options.configured ?? (packed && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')));
  let current = { state: configured ? 'idle' : 'unconfigured', version: app.getVersion(), available: null, progress: 0, detail: '' };
  let updater = null;
  let loading = null;
  async function initialize() {
    if (!configured) return null;
    if (updater) return updater;
    if (loading) return loading;
    loading = import('electron-updater').then(module => {
      const instance = module.default?.autoUpdater || module.autoUpdater;
      if (!instance) throw new Error('No se pudo iniciar el actualizador.');
      instance.autoDownload = true;
      instance.autoInstallOnAppQuit = false;
      instance.on('checking-for-update', () => { current = { ...current, state: 'checking', detail: '' }; });
      instance.on('update-available', info => { current = { ...current, state: 'available', available: info.version }; });
      instance.on('update-not-available', () => { current = { ...current, state: 'up-to-date', available: null }; });
      instance.on('download-progress', info => { current = { ...current, state: 'downloading', progress: Math.round(info.percent) }; });
      instance.on('update-downloaded', info => { current = { ...current, state: 'ready', progress: 100, available: info.version }; });
      instance.on('error', error => { current = { ...current, state: 'error', detail: String(error?.message || 'No se pudo consultar la actualización.').slice(0, 140) }; });
      updater = instance;
      return instance;
    }).catch(error => {
      current = { ...current, state: 'error', detail: String(error.message).slice(0, 140) };
      loading = null;
      return null;
    });
    return loading;
  }
  async function check() {
    if (!configured) return { ...current, detail: 'Las actualizaciones están disponibles después de instalar VORTEX desde una versión publicada.' };
    const service = await initialize();
    if (!service) return { ...current };
    if (current.state === 'checking' || current.state === 'downloading') return { ...current };
    await service.checkForUpdates();
    return { ...current };
  }
  function status() { return { ...current }; }
  async function install() {
    if (current.state !== 'ready' || !updater) throw new Error('Aún no se ha descargado ninguna actualización.');
    updater.quitAndInstall(false, true);
    return { installing: true };
  }
  function start() {
    if (!configured) return;
    setTimeout(() => { check().catch(() => {}); }, 12000).unref?.();
    setInterval(() => { check().catch(() => {}); }, 6 * 60 * 60 * 1000).unref?.();
  }
  return { check, status, install, start };
}
