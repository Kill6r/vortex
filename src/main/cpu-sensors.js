import { executeJson } from './powershell.js';
import { createCpuSensorWorker } from './cpu-sensor-worker.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function normalizeCpuSensors(input) {
  const rows = (Array.isArray(input) ? input : input ? [input] : []).filter(row =>
    /\/(?:amd|intel)cpu\//i.test(String(row.Identifier || row.Parent || '')) &&
    typeof row.Value === 'number' && Number.isFinite(row.Value));
  const pick = (type, pattern, min, max) => {
    const row = rows.find(row => row.SensorType === type && pattern.test(row.Name || '') && !/limit|percent|%/i.test(row.Name || '') && !(type === 'Voltage' && /vid|requested/i.test(row.Name || '')) && row.Value >= min && row.Value <= max);
    return row ? row.Value : null;
  };
  return {
    peakClockMHz: (() => { const clocks = rows.filter(row => row.SensorType === 'Clock' && /core/i.test(row.Name || '') && !/effective/i.test(row.Name || '') && row.Value > 0 && row.Value < 10000).map(row => row.Value); return clocks.length ? Math.max(...clocks) : null; })(),
    socPowerW: pick('Power', /soc/i, 0, 300),
    cpuVoltageV: pick('Voltage', /vcore|cpu core|^core \(svi[23] tfn\)/i, 0.1, 3),
    socVoltageV: pick('Voltage', /soc/i, 0.1, 3),
    ioClockMHz: pick('Clock', /I\/O|IOD/i, 0, 10000),
    pptLimitW: (() => { const row = rows.find(row => row.SensorType === 'Power' && /ppt.*limit|limit.*ppt/i.test(row.Name || '') && row.Value > 0); return row?.Value ?? null; })(),
    tdcLimitA: (() => { const row = rows.find(row => row.SensorType === 'Current' && /tdc.*limit|limit.*tdc/i.test(row.Name || '') && row.Value > 0); return row?.Value ?? null; })(),
    edcLimitA: (() => { const row = rows.find(row => row.SensorType === 'Current' && /edc.*limit|limit.*edc/i.test(row.Name || '') && row.Value > 0); return row?.Value ?? null; })(),
    source: rows.length ? 'Libre Hardware Monitor · WMI' : 'Windows · uso y frecuencia',
    temperatureC: pick('Temperature', /package|tctl|tdie|core average/i, 1, 130),
    packagePowerW: pick('Power', /package/i, 0, 2000),
    pptW: pick('Power', /\bppt\b/i, 0, 2000),
    tdcA: pick('Current', /\btdc\b/i, 0, 2000),
    edcA: pick('Current', /\bedc\b/i, 0, 2000),
    note: rows.length ? 'Se graban solo sensores publicados por el hardware. — significa no disponible; PPT/TDC/EDC pueden no estar expuestos.' : 'Uso y frecuencia disponibles. Para temperatura y consumo, abre Libre Hardware Monitor con su proveedor WMI activo. PPT/TDC/EDC solo aparecen si el proveedor los publica.'
  };
}

export function normalizeCpuSensorFrame(frame = {}) {
  const status = typeof frame.status === 'string' ? frame.status : 'sensor-error';
  // A missing/denied driver must never turn uninitialised hardware values into readings.
  const rows = status === 'ready' && Array.isArray(frame.sensors) ? frame.sensors.filter(row=>/\/(amd|intel)cpu\//i.test(String(row.Identifier || row.Parent || ''))) : [];
  const result = normalizeCpuSensors(rows);
  const cores = rows.filter(row => row.SensorType === 'Clock' && /\/(amd|intel)cpu\//i.test(String(row.Identifier || row.Parent || '')) && /core\s*#?\d+/i.test(row.Name || '') && !/effective/i.test(row.Name || '') && Number.isFinite(row.Value) && row.Value > 100 && row.Value < 10000);
  const meanSensor = rows.find(row => row.SensorType === 'Clock' && /cores?\s*\(average\)/i.test(row.Name || '') && Number.isFinite(row.Value) && row.Value > 100 && row.Value < 10000);
  const averageMHz = meanSensor?.Value ?? (cores.length ? cores.reduce((sum,row)=>sum+row.Value,0)/cores.length : null);
  const validMHz = value => Number.isFinite(value) && value > 100 && value < 10000 ? value : null;
  const windowsAverage = validMHz(frame.windowsClock?.averageMHz);
  const windowsPeak = validMHz(frame.windowsClock?.peakMHz);
  const smu = status === 'ready' && (frame.smu?.tuning?.supported === true || frame.smu?.tuning?.readOnly === true) ? frame.smu : null;
  const native = {};
  for (const [key, min, max] of [['pptW',0,300],['tdcA',0,300],['pptLimitW',1,300],['tdcLimitA',1,300],['edcLimitA',1,500],['cpuVoltageV',.1,2],['socVoltageV',.1,2],['socPowerW',0,200],['fabricClockMHz',100,4000],['thermalLimitC',30,120]]) {
    if (Number.isFinite(smu?.[key]) && smu[key] >= min && smu[key] <= max) native[key] = smu[key];
  }
  const notes = {
    'driver-missing': 'Para leer temperatura, consumo y voltajes, activa el controlador oficial de sensores. No hace falta abrir otra aplicación.',
    'access-denied': 'El controlador está instalado. Permite la lectura de sensores con el aviso de Windows para conectar temperatura, frecuencia y consumo.',
    'starting': 'Iniciando el lector integrado de sensores…',
    'sensor-error': 'No se pudo conectar con el lector de hardware. Puedes reconectarlo desde aquí.',
    'stale': 'El lector no ha enviado muestras recientes. Las lecturas anteriores no se muestran como actuales.',
    'ready': 'Lectura integrada de hardware cada segundo. Solo aparecen los sensores publicados por este procesador.'
  };
  return {
    ...result,
    ...native,
    packagePowerW: result.packagePowerW ?? (Number.isFinite(smu?.packagePowerW) && smu.packagePowerW >= 0 && smu.packagePowerW <= 300 ? smu.packagePowerW : null),
    tuning: smu?.tuning ?? {supported:false,error:frame.smu?.tuning?.error || null},
    peakClockMHz: result.peakClockMHz ?? windowsPeak,
    peakEstimated: result.peakClockMHz === null && windowsPeak !== null,
    cpuGHz: averageMHz !== null ? averageMHz / 1000 : windowsAverage !== null ? windowsAverage / 1000 : null,
    frequencyEstimated: averageMHz === null && windowsAverage !== null,
    source: smu ? 'SMU directo + sensores integrados' : rows.length ? 'Lector integrado · Libre Hardware Monitor' : 'Contadores de Windows',
    sensorStatus: status,
    note: smu?.tuning.readOnly ? smu.tuning.error : smu ? 'Telemetría directa cada segundo. EDC muestra el límite configurado si la corriente instantánea no está disponible.' : notes[status] || notes['sensor-error'],
    sampledAt: Number.isFinite(frame.sampledAt) ? frame.sampledAt : Date.now()
  };
}

export function createCpuSensorController(options) {
  return createCpuSensorWorker({ ...options, normalize: normalizeCpuSensorFrame });
}

export async function activateCpuSensorDriver(directory) {
  const installer = path.join(directory, 'PawnIO_setup.exe');
  const expected = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032';
  const hash = createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  if (hash !== expected) throw new Error('El instalador de sensores no coincide con la versión oficial verificada.');
  const literal = `'${installer.replace(/'/g,"''")}'`;
  const result = await executeJson(`$file=${literal}; $signature=Get-AuthenticodeSignature -LiteralPath $file; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=namazso.eu') { throw 'La firma del controlador de sensores no es válida.' }; $p=Start-Process -FilePath $file -ArgumentList '-install' -Verb RunAs -PassThru -ErrorAction Stop; [pscustomobject]@{launched=($null -ne $p)} | ConvertTo-Json -Compress`);
  if (!result?.launched) throw new Error('No se pudo abrir el instalador de sensores.');
  return result;
}
