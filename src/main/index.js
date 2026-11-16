import { app, BrowserWindow, clipboard, ipcMain, Menu, Tray, shell } from 'electron';
import fs from 'node:fs';
import { explainWindowsError } from '../core/errors.js';
import { createLiveMetricsController } from './live-metrics.js';
import { createCpuBenchmarkController } from './cpu-benchmark.js';
import { createCpuProfileSweep } from './cpu-profile-sweep.js';
import { RYZEN_9600X_MAX_BOOST_TARGET_MHZ } from '../core/cpu-benchmark-analysis.js';
import { createCpuSensorController, activateCpuSensorDriver } from './cpu-sensors.js';
import { createCpuRecordingController } from './cpu-recording.js';
import { createCpuLibrary } from './cpu-library.js';
import os from 'node:os';
import { createUpdateController } from './updates.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSystemOverview, getHardwareDetails, getHvciStatus } from './system.js';
import { listWindowsServices } from './services.js';
import { createHistoryStore } from './history.js';
import { createOperations } from './operations.js';
import { createMemoryController } from './memory.js';
import { createCleanerController } from './cleaner.js';
import { createGamingController } from './games.js';
import { createStandbyController } from './standby.js';
import { runStandbyHelper } from './standby-runner.js';
import { createGameProfileStore } from './profiles.js';
import { adminStatus, requestElevation } from './admin.js';
import { createSettingsStore } from './settings-store.js';
import { createTelemetryController } from './telemetry.js';
import { isGameProcessCandidate } from '../core/game-discovery.js';
import { getStartupStatus, setStartupStatus } from './startup.js';
import { windowSettings } from '../core/window-settings.js';
import { readVisualSettings, changeVisualSetting, restoreVisualSetting, readGraphicsStatus, changeHags, restoreHags, readStartupIoRule, changeStartupIoRule, restoreStartupIoRule, readSecurityStatus } from './windows-tweaks.js';
import { readExtraTweaks, setExtraTweak, restoreExtraTweak } from './extra-tweaks.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let tray = null;
let storedSettings = null;
let closeToTray = true;
let allowQuit = false;
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
    { label: 'Salir de VORTEX', click: () => { allowQuit = true; app.quit(); } }
  ]));
  tray.on('double-click', revealWindow);
  tray.on('click', revealWindow);
}


function createWindow() {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    thickFrame: true,
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 690,
    backgroundColor: '#0b1526',
    title: 'VORTEX',
    icon: path.join(currentDirectory, 'assets', 'vortex-logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === 'win32' && typeof window.setBackgroundMaterial === 'function') {
    try { window.setBackgroundMaterial('mica'); }
    catch {}
  }

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
  window.on('close', event => {
    if (allowQuit || app.isQuittingAfterRestore || !closeToTray || !tray) return;
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
  closeToTray = windowSettings(settings.read().window).closeToTray;
  setupTray();
  const telemetry = createTelemetryController();
  const cpuSensorDirectory = app.isPackaged ? path.join(process.resourcesPath, 'cpu-monitor') : path.join(currentDirectory, 'cpu-monitor');
  const cpuSensors = createCpuSensorController({ directory: cpuSensorDirectory });
  cpuSensors.start();
  const liveMetrics = createLiveMetricsController({ telemetry, cpuSensorSampler: () => cpuSensors.latest() });
  const cpuRecording = createCpuRecordingController({
    filename: path.join(app.getPath('userData'), 'cpu-sensor-recording.json'),
    sample: async () => {
      const [metrics, sensors] = await Promise.all([liveMetrics.snapshot(), cpuSensors.snapshot()]);
      return { ...metrics, ...sensors, cpuGHz: sensors.cpuGHz ?? metrics.cpuGHz };
    },
    onStatus: status => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('cpu:recording-changed', status);
      }
    }
  });
  const cpuLibrary = createCpuLibrary({ filename: path.join(app.getPath('userData'), 'cpu-library.json') });
  let benchmarkRecordingId = null;
  let sweepBenchmarkComplete = null;
  let manualTuning = false;
  const saveBenchmark = result => cpuLibrary.addBenchmark(result, os.cpus()[0]?.model?.trim() || '');
  const cpuBenchmark = createCpuBenchmarkController({
    sampleMetrics: async () => {
      const metrics = await liveMetrics.snapshot();
      const sensors = cpuSensors.latest();
      return { ...metrics, ...sensors, cpuGHz: sensors.cpuGHz ?? metrics.cpuGHz, sensorSampledAt: sensors.sampledAt };
    },
    onProgress: status => {
      const automated = Boolean(sweepBenchmarkComplete);
      if (!status.running && sweepBenchmarkComplete) {
        const complete = sweepBenchmarkComplete;
        sweepBenchmarkComplete = null;
        complete(status);
      }
      if (!automated && status.completed && status.result) {
        try { saveBenchmark(status.result); }
        catch { status = { ...status, historyError: 'No se pudo guardar el benchmark en el historial.' }; }
      }
      if (!status.running && benchmarkRecordingId !== null) {
        if (cpuRecording.status().recordingId === benchmarkRecordingId) cpuRecording.stop();
        benchmarkRecordingId = null;
      }
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('cpu:benchmark-changed', { ...status, automated });
      }
    }
  });
  const sweep = createCpuProfileSweep({
    read: () => cpuSensors.latest(),
    tune: (target, fingerprint) => cpuSensors.tune(target, fingerprint, 'trial'),
    runBenchmark: options => new Promise((resolve, reject) => {
      sweepBenchmarkComplete = status => {
        if (status.completed && status.result) resolve(status.result);
        else reject(new Error(status.error || 'Benchmark detenido.'));
      };
      cpuBenchmark.start(options).catch(error => { sweepBenchmarkComplete = null; reject(error); });
    }),
    stopBenchmark: () => cpuBenchmark.stop(),
    onResult: saveBenchmark
  });
  function requireSweepIdle() {
    if (sweep.isRunning()) throw new Error('Espera a que termine la ronda de perfiles o detenla primero.');
  }
  async function manualCpuTune(target, fingerprint, action) {
    requireSweepIdle();
    if (cpuBenchmark.status().running) throw new Error('Detén el benchmark antes de cambiar la configuración de CPU.');
    if (manualTuning) throw new Error('Ya hay un ajuste de CPU en curso.');
    if (action === 'apply' && target?.fmaxMHz > RYZEN_9600X_MAX_BOOST_TARGET_MHZ && target.fmaxMHz !== cpuSensors.latest().tuning?.fmaxMHz) {
      throw new Error(`El objetivo máximo de boost de VORTEX para el Ryzen 5 9600X es ${RYZEN_9600X_MAX_BOOST_TARGET_MHZ} MHz (+200 MHz).`);
    }
    manualTuning = cpuSensors.tune(target, fingerprint, action);
    try { return await manualTuning; }
    finally { manualTuning = false; }
  }
  updates = createUpdateController({
    onStatus: status => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('updates:changed', status);
      }
    }
  });
  const gaming = createGamingController({ ruleStore: createGameProfileStore(app.getPath('userData')), allowAutomatic: () => automaticOptimizations,
    gpuCount: async () => {
      try {
        const details = await getHardwareDetails();
        return details.gpus.filter(name => !/microsoft basic|remote display/i.test(name)).length;
      } catch { return 0; }
    },
    listProcesses: async () => (await telemetry.snapshot()).groups.flatMap(group => group.entries.filter(isGameProcessCandidate).map(item => ({ ...item, groupCpuPercent: group.cpuPercent, groupMemory: group.memory, ramPercent: group.ramPercent, gpuPercent: group.gpuPercent, processCount: group.count }))) });
  const standby = createStandbyController({ store: settings, canAutomate: () => automaticOptimizations, gameActive: () => Boolean(gaming.status()), runPurge: mode => runStandbyHelper(mode, { packaged: app.isPackaged }) });
  const memory = createMemoryController(() => gaming.status(), { store: settings, telemetry, canAutomate: () => automaticOptimizations });
  const cleaner = createCleanerController({ isAdmin: async () => (await adminStatus()).enabled === true });

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
    closeToTray = next.closeToTray;
    storedSettings.write({ window: next });
    return next;
  });
  register('window:minimize', event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== mainWindow) return false;
    window.minimize();
    return true;
  });
  register('window:maximize', event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== mainWindow) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });
  register('window:close', event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== mainWindow) return false;
    window.close();
    return true;
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
  register('system:copy-text', (_event, value) => {
    if (typeof value !== 'string' || value.length > 2000) throw new Error('Texto para copiar no valido.');
    clipboard.writeText(value);
    return true;
  });
  register('cpu:benchmark-start', async (_event, options) => {
    requireSweepIdle();
    if (manualTuning) throw new Error('Espera a que termine el ajuste de CPU.');
    const tuning = cpuSensors.latest().tuning;
    const result = await cpuBenchmark.start({ ...options, configuration: tuning?.supported ? tuning : null });
    if (!cpuRecording.status().running) benchmarkRecordingId = cpuRecording.start({ durationSeconds: result.durationSeconds }).recordingId;
    return result;
  });
  register('cpu:library', () => cpuLibrary.snapshot());
  register('cpu:profile-save', (_event, profile) => cpuLibrary.saveProfile(profile));
  register('cpu:profile-delete', (_event, id) => cpuLibrary.deleteProfile(id));
  register('cpu:history-delete', (_event, id) => cpuLibrary.deleteBenchmark(id));
  register('cpu:recording-start', (_event, options) => {
    const durationSeconds = options?.durationSeconds ?? 300;
    if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 3600) throw new Error('Elige una duración entre 1 y 60 minutos.');
    return cpuRecording.start({ durationSeconds });
  });
  register('cpu:recording-stop', () => cpuRecording.stop());
  register('cpu:recording-status', () => cpuRecording.status());
  register('cpu:sensors', () => cpuSensors.snapshot());
  register('cpu:tuning-apply', (_, input, fingerprint) => manualCpuTune(input, fingerprint, 'apply'));
  register('cpu:tuning-undo', (_, fingerprint) => manualCpuTune(null, fingerprint, 'undo'));
  register('cpu:sensors-activate', () => activateCpuSensorDriver(cpuSensorDirectory));
  register('cpu:sensors-authorize', () => { requireSweepIdle(); return cpuSensors.elevate(); });
  register('cpu:sensors-reconnect', () => { requireSweepIdle(); cpuSensors.restart(); return true; });
  register('cpu:sweep-analyze', () => {
    if (cpuBenchmark.status().running || manualTuning) throw new Error('Espera a que termine la operación de CPU actual.');
    return sweep.analyze();
  });
  register('cpu:sweep-start', (_, options) => {
    if (cpuBenchmark.status().running || manualTuning) throw new Error('Espera a que termine la operación de CPU actual.');
    if (!cpuSensors.latest().tuningReady) throw new Error('Conecta la CPU para autorizar la prueba automática.');
    return sweep.start(options);
  });
  register('cpu:sweep-status', () => sweep.status());
  register('cpu:sweep-stop', () => sweep.stop());
  register('cpu:benchmark-status', () => cpuBenchmark.status());
  register('cpu:benchmark-stop', () => { requireSweepIdle(); return cpuBenchmark.stop(); });
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
  register('windows:graphics', () => readGraphicsStatus(undefined, undefined, undefined, settings));
  register('windows:hags-set', (_event, enabled) => changeHags(enabled, settings));
  register('windows:hags-restore', () => restoreHags(settings));
  register('windows:io-rule', (_event, exe) => readStartupIoRule(exe));
  register('windows:io-rule-set', (_event, exe, level) => changeStartupIoRule(exe, level, settings));
  register('windows:io-rule-restore', (_event, exe) => restoreStartupIoRule(exe, settings));
  register('windows:security', () => readSecurityStatus());
  register('windows:extra-tweaks', () => readExtraTweaks());
  register('windows:extra-set', (_event, id, enabled) => setExtraTweak(id, enabled, settings));
  register('windows:extra-restore', (_event, id) => restoreExtraTweak(id, settings));
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

  register('system:open-ryzen-master', async () => {
    if (process.platform !== 'win32') throw new Error('Ryzen Master solo esta disponible en Windows.');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const paths = [
      path.join(programFiles, 'AMD', 'RyzenMaster', 'bin', 'AMD Ryzen Master.exe'),
      path.join(programFiles, 'AMD', 'Ryzen Master', 'bin', 'AMD Ryzen Master.exe')
    ];
    const installed = paths.find(candidate => fs.existsSync(candidate));
    if (installed) {
      const error = await shell.openPath(installed);
      if (error) throw new Error(error);
      return { opened: 'installed' };
    }
    await shell.openExternal('https://www.amd.com/es/products/software/ryzen-master.html');
    return { opened: 'download' };
  });

  register('system:open-link', async (_event, target) => {
    const destinations = {
      github: 'https://github.com/Kill6r/vortex',
      'amd-ryzen-master': 'https://www.amd.com/es/products/software/ryzen-master.html',
      'amd-ryzen-monitoring-sdk': 'https://www.amd.com/en/developer/ryzen-master-monitoring-sdk.html'
    };
    if (!Object.hasOwn(destinations, target)) throw new Error('El enlace solicitado no esta permitido.');
    await shell.openExternal(destinations[target]);
    return true;
  });

  register('system:history', () => history.read());
  register('cleaner:scan', (_event, force) => cleaner.scan(force === true));
  register('cleaner:run', (_event, ids, advanced) => cleaner.clean(ids, advanced === true));
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

  let waitingForCpuOnQuit = false;
  app.on('before-quit', event => {
    if (sweep.isRunning() || manualTuning) {
      event.preventDefault();
      if (!waitingForCpuOnQuit) {
        waitingForCpuOnQuit = true;
        void Promise.resolve(sweep.isRunning() ? sweep.stop() : manualTuning)
          .catch(() => {}).finally(() => {
            waitingForCpuOnQuit = false;
            app.quit();
          });
      }
      return;
    }
    allowQuit = true;
    cpuRecording.dispose();
    cpuSensors.dispose();
    if (app.isQuittingAfterRestore) return;
    if (!gaming.status()) { cpuBenchmark.dispose(); memory.dispose(); standby.dispose(); telemetry.dispose(); gaming.dispose(); return; }
    event.preventDefault();
    gaming.stop().catch(() => {}).finally(() => {
      cpuBenchmark.dispose(); memory.dispose(); standby.dispose(); telemetry.dispose(); gaming.dispose();
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
