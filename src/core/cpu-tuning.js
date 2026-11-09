export function cpuTuningAdvice(cpuName) {
  const name = String(cpuName || '').trim();
  const amd = /\bAMD\b.*\bRyzen\b|\bRyzen\b/i.test(name);
  const intel = /\bIntel\b/i.test(name);
  return {
    name: name || 'Procesador no identificado',
    vendor: amd ? 'amd' : intel ? 'intel' : 'other',
    candidate: amd,
    supported: false,
    external: amd,
    note: amd
      ? 'Ryzen Master puede ofrecer Auto Overclock y pruebas de estabilidad, si la CPU, la placa y el controlador son compatibles. VORTEX no modifica frecuencias ni voltajes.'
      : intel
        ? 'El ajuste automatico depende del modelo y de las herramientas oficiales. VORTEX no modificara este procesador.'
        : 'No se pudo confirmar una herramienta de OC compatible. VORTEX no cambiara frecuencias ni voltajes.'
  };
}

export function cpuBaselineSummary(rows) {
  if (!Array.isArray(rows)) return { count: 0, averageUsage: null, averageGhz: null, peakUsage: null };
  const usages = rows.map(row => row?.cpuUsage).filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  const frequencies = rows.map(row => row?.cpuGHz).filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10);
  const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  return { count: rows.length, averageUsage: average(usages), averageGhz: average(frequencies), peakUsage: usages.length ? Math.round(Math.max(...usages)) : null };
}
