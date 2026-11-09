import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readDownloadProgress } from '../core/update-progress.js';

export function createUpdateController(options = {}) {
  const packed = options.packaged ?? app.isPackaged;
  const configured = options.configured ?? (packed && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')));
  const notify = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  let current = { state: configured ? 'idle' : 'unconfigured', version: app.getVersion(), available: null, progress: null, transferred: null, total: null, bytesPerSecond: null, detail: '' };
  let updater = null;
  let loading = null;
  let checking = null;

  function publish(change) {
    current = { ...current, ...change };
    try { notify({ ...current }); } catch {}
    return { ...current };
  }

  async function initialize() {
    if (!configured) return null;
    if (updater) return updater;
    if (loading) return loading;
    loading = import('electron-updater').then(module => {
      const instance = module.default?.autoUpdater || module.autoUpdater;
      if (!instance) throw new Error('No se pudo iniciar el actualizador.');
      instance.autoDownload = true;
      instance.autoInstallOnAppQuit = false;
      instance.on('checking-for-update', () => publish({ state: 'checking', progress: null, detail: '' }));
      instance.on('update-available', info => publish({ state: 'available', available: info.version, progress: null, detail: '' }));
      instance.on('update-not-available', () => publish({ state: 'up-to-date', available: null, progress: null, transferred: null, total: null, bytesPerSecond: null, detail: '' }));
      instance.on('download-progress', info => publish({ state: 'downloading', available: current.available, ...readDownloadProgress(info) }));
      instance.on('update-downloaded', info => publish({ state: 'ready', progress: 100, available: info.version, bytesPerSecond: null }));
      instance.on('error', error => publish({ state: 'error', detail: String(error?.message || 'No se pudo consultar la actualización.').slice(0, 260), bytesPerSecond: null }));
      updater = instance;
      return instance;
    }).catch(error => {
      publish({ state: 'error', detail: String(error.message).slice(0, 260) });
      loading = null;
      return null;
    });
    return loading;
  }

  async function check() {
    if (!configured) return { ...current, detail: 'Las actualizaciones están disponibles después de instalar VORTEX desde una versión publicada.' };
    if (checking || ['checking', 'available', 'downloading', 'ready'].includes(current.state)) return status();
    publish({ state: 'checking', progress: null, transferred: null, total: null, bytesPerSecond: null, detail: '' });
    checking = (async () => {
      const service = await initialize();
      if (!service) return status();
      try {
        await service.checkForUpdates();
      } catch (error) {
        publish({ state: 'error', detail: String(error?.message || 'No se pudo buscar la actualización.').slice(0, 260), bytesPerSecond: null });
      }
      return status();
    })();
    try { return await checking; }
    finally { checking = null; }
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
