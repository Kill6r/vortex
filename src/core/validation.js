import { findCatalogEntry, isProtectedService } from './catalog.js';

export const startupModes = ['Automatic', 'AutomaticDelayed', 'Manual', 'Disabled'];

export function validateServiceChange(name, mode, advanced = false) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_.-]{1,140}$/.test(name)) {
    throw new Error('Nombre de servicio inválido.');
  }

  if (!startupModes.includes(mode)) {
    throw new Error('Tipo de inicio no permitido.');
  }

  if (isProtectedService(name)) {
    throw new Error('Este servicio es crítico para Windows y está protegido por VORTEX.');
  }

  const entry = findCatalogEntry(name);
  if ((!entry?.preference || entry.risk === 'elevado') && advanced !== true) {
    throw new Error('Este servicio requiere activar el modo avanzado y confirmar los riesgos.');
  }

  return { name, mode, advanced };
}

export function normalizeStartMode(mode) {
  if (mode === 'Auto' || mode === 'Automatic') return 'Automatic';
  if (mode === 'AutomaticDelayed' || mode === 'Delayed') return 'AutomaticDelayed';
  if (mode === 'Manual') return 'Manual';
  if (mode === 'Disabled') return 'Disabled';
  return null;
}
