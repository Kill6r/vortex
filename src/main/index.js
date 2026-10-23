import { app, BrowserWindow, ipcMain, Menu, Tray, shell } from 'electron';
import fs from 'node:fs';
import { explainWindowsError } from '../core/errors.js';
import { createLiveMetricsController } from './live-metrics.js';
import { createUpdateController } from './updates.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSystemOverview, getHardwareDetails, getHvciStatus } from './system.js';
import { listWindowsServices } from './services.js';
import { createHistoryStore } from './history.js';
import { createOperations } from './operations.js';
import { createMemoryController } from './memory.js';
import { createGamingController } from './games.js';
import { createStandbyController } from './standby.js';
import { runStandbyHelper } from './standby-runner.js';
import { createGameProfileStore } from './profiles.js';
import { adminStatus, requestElevation } from './admin.js';
import { createSettingsStore } from './settings-store.js';
import { createTelemetryController } from './telemetry.js';
import { getStartupStatus, setStartupStatus } from './startup.js';
import { windowSettings } from '../core/window-settings.js';
import { readVisualSettings, changeVisualSetting, restoreVisualSetting, readGraphicsStatus, changeHags, restoreHags, readStartupIoRule, changeStartupIoRule, restoreStartupIoRule, readSecurityStatus } from './windows-tweaks.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let tray = null;
let storedSettings = null;
let minimizeToTray = true;
let updates = null;

function register(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await handler(event, ...args); }
    catch (error) {
      try {
        const filename = path.join(app.getPath('userData'), 'vortex-errors.log');
        if (fs.existsSync(filename) && fs.statSync(filename).size > 512000) fs.renameSync(filename, `${filename}.old`);
        fs.appendFileSync(filename, `${new Date().toISOString()} [${channel}] ${String(error?.stack || error)}\n`);
      } catch {}
      throw new Error(explainWindowsError(error?.message || error));
    }
  });
}

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function setupTray() {
  tray = new Tray(path.join(currentDirectory, 'assets', 'vortex-tray.png'));
  tray.setToolTip('VORTEX · Optimizador del sistema');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir VORTEX', click: revealWindow },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]));
  tray.on('double-click', revealWindow);
  tray.on('click', revealWindow);
}


function createWindow() {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 690,
    backgroundColor: '#202020',
    title: 'VORTEX',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = window;
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  window.webContents.on('did-fail-load', (_event, code, reason) => {
    if (code === -3) return;
    if (!window.isDestroyed()) {
      window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<div style="font:14px Segoe UI;color:#ddd;background:#202020;padding:40px"><h2>No se pudo cargar VORTEX</h2><p>Revisa la terminal de npm run dev y reinicia la aplicación.</p></div>')}`).catch(() => {});
      window.show();
    }
  });
  window.on('minimize', event => {
    if (!minimizeToTray || !tray) return;
    event.preventDefault();
    window.hide();
  });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());

  if (app.isPackaged) {
    window.loadFile(path.join(currentDirectory, '../../dist/renderer/index.html'));
  } else {
    window.loadURL('http://127.0.0.1:5173');
  }
}

app.whenReady().then(() => {
  const history = createHistoryStore(app.getPath('userData'));
  const operations = createOperations(history);
  const settings = createSettingsStore(app.getPath('userData'));
  let automaticOptimizations = settings.read().automaticOptimizations === true;
  storedSettings = settings;
  minimizeToTray = windowSettings(settings.read().window).minimizeToTray;
  setupTray();
  const telemetry = createTelemetryController();
  const liveMetrics = createLiveMetricsController({ telemetry });
  updates = createUpdateController();
  const gaming = createGamingController({ ruleStore: createGameProfileStore(app.getPath('userData')), allowAutomatic: () => automaticOptimizations,
    gpuCount: async () => {
      try {
        const details = await getHardwareDetails();
        return details.gpus.filter(name => !/microsoft basic|remote display/i.test(name)).length;
      } catch { return 0; }
    },
    listProcesses: async () => (await telemetry.snapshot()).groups.flatMap(group => group.entries.filter(item => item.visible).map(item => ({ ...item, groupCpuPercent: group.cpuPercent, groupMemory: group.memory, ramPercent: group.ramPercent, gpuPercent: group.gpuPercent, processCount: group.count }))) });
  const standby = createStandbyController({ store: settings, canAutomate: () => automaticOptimizations, gameActive: () => Boolean(gaming.status()), runPurge: mode => runStandbyHelper(mode, { packaged: app.isPackaged }) });
  const memory = createMemoryController(() => gaming.status(), { store: settings, telemetry, canAutomate: () => automaticOptimizations });

  register('optimizer:status', () => ({ enabled: automaticOptimizations }));
  register('optimizer:set-automatic', async (_event, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('Configuración automática inválida.');
    automaticOptimizations = enabled;
    settings.write({ automaticOptimizations });
    gaming.dispose();
    memory.refreshAutomaticSchedule();
    standby.refreshAutomaticSchedule();
    if (enabled) gaming.startWatching();
    else if (gaming.status()) await gaming.stop();
    return { enabled: automaticOptimizations };
  });

  register('window:settings', () => windowSettings(storedSettings.read().window));
  register('window:settings-set', (_event, value) => {
    const next = windowSettings(value);
    minimizeToTray = next.minimizeToTray;
    storedSettings.write({ window: next });
    return next;
  });
  register('window:minimize-tray', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.hide();
    return true;
  });
  register('system:admin', () => adminStatus());
  register('system:startup', () => getStartupStatus());
  register('system:startup-set', (_event, enabled) => setStartupStatus(enabled));
  register('system:live', () => liveMetrics.snapshot());
  register('updates:status', () => updates.status());
  register('updates:check', () => updates.check());
  register('updates:install', () => updates.install());
  register('system:telemetry', () => telemetry.snapshot().then(result => ({ groups: result.groups, sampledAt: result.sampledAt, gpuSupported: result.gpuSupported })));
  register('profiles:list', () => settings.profiles());
  register('profiles:save', (_event, name) => settings.saveProfile(name, memory.config(), standby.config()));
  register('profiles:delete', (_event, name) => settings.deleteProfile(name));
  register('profiles:apply', (_event, name) => {
    const profile = settings.profiles().find(item => item.name === name);
    if (!profile) throw new Error('El perfil no existe.');
    const memoryResult = memory.configureAuto(profile.memory);
    const standbyResult = standby.configureSchedule(profile.standby?.mode === 'all' ? { enabled: false, mode: 'low', intervalMinutes: 60 } : profile.standby);
    return { memory: memoryResult, standby: standbyResult };
  });
  register('system:request-admin', () => requestElevation());
  register('system:overview', () => getSystemOverview());
  register('system:hardware', () => getHardwareDetails());
  register('system:services', () => listWindowsServices());
  register('system:hvci', () => getHvciStatus());
  register('windows:visual', () => readVisualSettings());
  register('windows:visual-set', (_event, key, enabled) => changeVisualSetting(key, enabled, settings));
  register('windows:visual-restore', (_event, key) => restoreVisualSetting(key, settings));
  register('windows:graphics', () => readGraphicsStatus());
  register('windows:hags-set', (_event, enabled) => changeHags(enabled, settings));
  register('windows:hags-restore', () => restoreHags(settings));
  register('windows:io-rule', (_event, exe) => readStartupIoRule(exe));
  register('windows:io-rule-set', (_event, exe, level) => changeStartupIoRule(exe, level, settings));
  register('windows:io-rule-restore', (_event, exe) => restoreStartupIoRule(exe, settings));
  register('windows:security', () => readSecurityStatus());
  register('windows:open-setting', async (_event, target) => {
    const destinations = {
      visualPerformance: 'SystemPropertiesPerformance.exe',
      power: 'ms-settings:powersleep',
      graphics: 'ms-settings:display-advancedgraphics',
      update: 'ms-settings:windowsupdate',
      defender: 'windowsdefender:'
    };
    if (!Object.hasOwn(destinations, target)) throw new Error('Esta seccion de Windows no esta permitida.');
    if (target === 'visualPerformance') {
      const { spawn } = await import('node:child_process');
      return new Promise((resolve, reject) => {
        const child = spawn('SystemPropertiesPerformance.exe', [], { detached: true, windowsHide: false, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(true); });
      });
    }
    await shell.openExternal(destinations[target]);
    return true;
  });

  register('system:history', () => history.read());
  register('memory:snapshot', () => memory.snapshot());
  register('memory:clean', (_event, request) => memory.clean(request));
  register('memory:auto', (_event, configuration) => memory.configureAuto(configuration));
  register('standby:snapshot', () => standby.snapshot());
  register('standby:purge', (_event, request) => standby.purge(request));
  register('standby:schedule', (_event, options) => standby.configureSchedule(options));
  register('games:processes', () => gaming.list());
  register('games:status', () => gaming.status());
  register('games:capabilities', () => gaming.capabilities());
  register('games:rules', () => gaming.savedRules());
  register('games:recommend', (_event, pid) => gaming.recommend(pid));
  register('games:save-rule', (_event, rule, previousMatch) => gaming.saveRule(rule, previousMatch));
  register('games:delete-rule', (_event, name) => gaming.deleteRule(name));
  register('games:perform', (_event, action) => gaming.perform(action));
  register('games:inspect-settings', (_event, pid) => gaming.inspectSettings(pid));
  register('games:activate', (_event, pid, options) => gaming.activate(pid, options));
  register('games:stop', () => gaming.stop());
  register('system:change-service', (_event, name, mode, advanced) => operations.change(name, mode, advanced));
  register('system:restore-service', (_event, id) => operations.restore(id));

  app.on('before-quit', event => {
    if (app.isQuittingAfterRestore) return;
    if (!gaming.status()) { memory.dispose(); standby.dispose(); telemetry.dispose(); gaming.dispose(); return; }
    event.preventDefault();
    gaming.stop().catch(() => {}).finally(() => {
      memory.dispose(); standby.dispose(); telemetry.dispose(); gaming.dispose();
      app.isQuittingAfterRestore = true;
      app.quit();
    });
  });

  createWindow();
  const watchTimer = setTimeout(() => { if (automaticOptimizations) gaming.startWatching(); }, 10000);
  watchTimer.unref?.();
  updates.start();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
