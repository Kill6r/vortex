import { validateCurveOptimizer, validatePboLimits } from './cpu-tuning.js';
import { NATIVE_LIMITS } from './cpu-native.js';

export function validateCpuProfile(input) {
  const errors = [];
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 60) errors.push('El nombre debe tener entre 1 y 60 caracteres.');
  const cpu = typeof input?.cpu === 'string' ? input.cpu.slice(0, 180) : '';
  if (!cpu.trim()) errors.push('No se ha identificado el procesador.');
  const limits = validatePboLimits(input?.limits, NATIVE_LIMITS);
  errors.push(...limits.errors);
  const coreCount = input?.coreCount;
  if (!Number.isInteger(coreCount) || coreCount < 1 || coreCount > 256) errors.push('Cantidad de núcleos no válida.');
  const curveMode = input?.curveMode;
  if (!['off', 'all', 'per-core'].includes(curveMode)) errors.push('Modo de Curve Optimizer no válido.');
  const curve = input?.curveOptimizer;
  if (!validateCurveOptimizer(curve, coreCount).valid) errors.push('Revisa los valores de Curve Optimizer.');
  if (curveMode === 'all' && (!Array.isArray(curve) || new Set(curve).size !== 1)) errors.push('El modo All Cores debe tener el mismo valor en todos los núcleos.');
  const boostOverrideMHz = input?.boostOverrideMHz;
  const scalar = input?.scalar;
  const fmaxMHz = input?.fmaxMHz;
  if (fmaxMHz != null && (!Number.isInteger(fmaxMHz) || fmaxMHz < 4000 || fmaxMHz > 5800)) errors.push('FMax debe ser un entero entre 4000 y 5800 MHz.');
  if (!Number.isInteger(boostOverrideMHz) || boostOverrideMHz < -200 || boostOverrideMHz > 200) errors.push('Boost Override debe ser un entero entre -200 y 200 MHz.');
  if (!Number.isInteger(scalar) || scalar < 1 || scalar > 10) errors.push('PBO Scalar debe ser un entero entre 1 y 10.');
  return { valid: !errors.length, errors, profile: { name, cpu, coreCount, limits: limits.values, curveMode, curveOptimizer: Array.isArray(curve) ? curve.map(value => curveMode === 'off' ? 0 : value) : [], boostOverrideMHz, scalar, ...(fmaxMHz == null ? {} : {fmaxMHz}) } };
}

export function gaugeStatus(value, limit) {
  if (!Number.isFinite(value)) return { level: 'unknown', label: 'No disponible' };
  if (!Number.isFinite(limit) || limit <= 0) return { level: 'ok', label: 'Lectura disponible · sin umbral evaluado' };
  const ratio = value / limit;
  return ratio >= 1 ? { level: 'danger', label: 'En el límite o por encima' } : ratio >= .8 ? { level: 'warning', label: 'Cerca del límite (80 % o más)' } : { level: 'ok', label: 'Por debajo del 80 % del límite' };
}

export function chartSegments(rows, key, width = 560, height = 130, maximum = null) {
  const values = rows.map(row => row?.[key]).filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return { segments: [], maximum: null, minimum: null };
  const ceiling = maximum || Math.max(1, ...values) * 1.1;
  const times = rows.map((row, i) => Number.isFinite(row?.sampledAt) ? row.sampledAt : i);
  const first = times[0]; const span = Math.max(1, times.at(-1) - first);
  const segments = []; let segment = [];
  rows.forEach((row, index) => {
    if (index > 0 && times[index] - times[index - 1] > 6000 && segment.length) { segments.push(segment); segment = []; }
    const value = row?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment); segment = []; return;
    }
    segment.push([8 + (times[index] - first) / span * (width - 16), height - 8 - Math.max(0, Math.min(1, value / ceiling)) * (height - 16)]);
  });
  if (segment.length) segments.push(segment);
  return { segments, maximum: Math.max(...values), minimum: Math.min(...values), ceiling };
}

export function downsampleCpuRows(rows, limit = 180) {
  if (!Array.isArray(rows)) return [];
  if (rows.length <= limit) return rows;
  return Array.from({ length: limit }, (_, index) => rows[Math.round(index * (rows.length - 1) / (limit - 1))]);
}
