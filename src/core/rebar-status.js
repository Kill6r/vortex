export function summarizeRebarResources(rows, gpus = []) {
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const candidates = items.filter(item => /nvidia|radeon\s*rx|intel\s*arc/i.test(String(item.name || '')) && Number.isFinite(Number(item.largestBarBytes)) && Number(item.largestBarBytes) > 0);
  const biggest = candidates.sort((a, b) => Number(b.largestBarBytes) - Number(a.largestBarBytes))[0];
  const title = biggest?.name || gpus.find(name => /nvidia|radeon\s*rx|intel\s*arc/i.test(name)) || gpus[0] || 'GPU';
  if (!biggest) return { state: 'unknown', confidence: 'none', source: 'Recursos PCI de Windows', description: 'Windows no expuso un rango PCI suficiente para evaluar ReBAR automaticamente.', adapter: title, largestBarBytes: null };
  const bytes = Number(biggest.largestBarBytes);
  if (bytes > 512 * 1024 ** 2) {
    return { state: 'possible-enabled', confidence: 'indicative', source: 'Recursos PCI de Windows', adapter: title, largestBarBytes: bytes, description: `Windows detecto un rango de memoria PCI de ${(bytes / 1024 ** 3).toLocaleString('es-CO', { maximumFractionDigits: 1 })} GB. Es un indicio de ReBAR, no una confirmacion del controlador.` };
  }
  return { state: 'unknown', confidence: 'none', source: 'Recursos PCI de Windows', adapter: title, largestBarBytes: bytes, description: 'No se detecto un rango PCI grande. Esto no demuestra que ReBAR este desactivado.' };
}
