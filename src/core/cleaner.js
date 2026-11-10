export const cleanerTargets = Object.freeze([
  { id: 'temp', title: 'Archivos temporales', description: 'Archivos temporales del usuario y de Windows que no estan en uso.', icon: 'FileClock', advanced: false, admin: false },
  { id: 'prefetch', title: 'Prefetch', description: 'Datos precargados por Windows. Limpiarlos puede ralentizar el inicio de aplicaciones.', icon: 'Gauge', advanced: true, admin: true },
  { id: 'recyclebin', title: 'Papelera de reciclaje', description: 'Archivos enviados a la papelera. Se eliminaran definitivamente.', icon: 'Trash2', advanced: false, admin: false, destructive: true },
  { id: 'windows-update', title: 'Cache de Windows Update', description: 'Descargas de actualizaciones. Solo se limpiaran si los servicios de actualizacion estan detenidos.', icon: 'Download', advanced: true, admin: true },
  { id: 'thumbnails', title: 'Cache de miniaturas', description: 'Miniaturas del Explorador. Windows las creara nuevamente cuando hagan falta.', icon: 'Image', advanced: false, admin: false },
  { id: 'errorreports', title: 'Informes de errores', description: 'Volcados CrashDumps e informes de errores de Windows del usuario.', icon: 'Bug', advanced: false, admin: false }
]);

export const cleanerIdSet = new Set(cleanerTargets.map(item => item.id));

export function validateCleanerSelection(ids, advancedAllowed = false) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > cleanerTargets.length) throw new Error('Selecciona una o varias categorias de limpieza.');
  if (ids.some(id => typeof id !== 'string' || !cleanerIdSet.has(id)) || new Set(ids).size !== ids.length) throw new Error('La seleccion contiene una categoria invalida o repetida.');
  const selected = cleanerTargets.filter(item => ids.includes(item.id));
  if (selected.some(item => item.advanced) && advancedAllowed !== true) throw new Error('Confirma los riesgos para las limpiezas avanzadas.');
  return selected;
}

export function formatCleanerBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const n = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** n).toFixed(n === 0 ? 0 : 1)} ${units[n]}`;
}
