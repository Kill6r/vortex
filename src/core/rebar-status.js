export function summarizeRebarResources(rows, gpus = [], nvidiaRows = []) {
  const bars = Array.isArray(nvidiaRows) ? nvidiaRows.filter(item => Number.isFinite(Number(item.bar1Bytes)) && Number(item.bar1Bytes) > 0) : [];
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const candidates = items.filter(item => /nvidia|radeon\s*rx|intel\s*arc/i.test(String(item.name || '')) && Number.isFinite(Number(item.largestBarBytes)) && Number(item.largestBarBytes) > 0);
  const biggest = candidates.sort((a, b) => Number(b.largestBarBytes) - Number(a.largestBarBytes))[0];
  const bar1 = bars.sort((a, b) => Number(b.bar1Bytes) - Number(a.bar1Bytes))[0];
  const title = bar1?.name || biggest?.name || gpus.find(name => /nvidia|radeon\s*rx|intel\s*arc/i.test(name)) || gpus[0] || 'GPU';
  const bytes = Number(bar1?.bar1Bytes || biggest?.largestBarBytes || 0);
  const source = bar1 ? 'Controlador NVIDIA (BAR1)' : 'Recursos PCI de Windows';
  if (!bytes) return { state: 'unknown', confidence: 'none', source, description: 'No se pudo leer una asignacion BAR de la GPU. Comprueba si el controlador permite esta consulta.', adapter: title, largestBarBytes: null };
  const size = bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toLocaleString('es-CO', { maximumFractionDigits: 1 })} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes > 512 * 1024 ** 2) return { state: 'large-bar', confidence: bar1 ? 'driver' : 'indicative', source, adapter: title, largestBarBytes: bytes, description: `Asignacion BAR ampliada de ${size} detectada ${bar1 ? 'por el controlador NVIDIA' : 'por Windows'}. Esto comprueba el tamano BAR, pero no demuestra que cada juego utilice ReBAR.` };
  return { state: 'small-bar', confidence: bar1 ? 'driver' : 'indicative', source, adapter: title, largestBarBytes: bytes, description: `Asignacion BAR de ${size}. No se encontro una BAR ampliada; algunas GPU o controladores pueden exponer recursos diferentes.` };
}
