export const RYZEN_5_9600X_STOCK_LIMITS = Object.freeze({ ppt: 88, tdc: 75, edc: 150 });

export const RYZEN_5_9600X_PROFILES = Object.freeze([
  { id: 'stock', name: 'Referencia AMD', description: 'Limites de referencia habituales para el 9600X de 65 W. Verifica los valores reales en tu BIOS.', ...RYZEN_5_9600X_STOCK_LIMITS },
  { id: 'balanced', name: 'Ahorro equilibrado', description: 'Primer escalon experimental para reducir consumo sin recortar demasiado los limites.', ppt: 75, tdc: 65, edc: 130 },
  { id: 'eco', name: 'Ahorro alto', description: 'Limites mas bajos para priorizar consumo y temperatura sobre el rendimiento multinucleo.', ppt: 65, tdc: 55, edc: 110 }
]);

export function cpuTuningAdvice(cpuName) {
  const name = String(cpuName || '').trim();
  const amd = /\bAMD\b.*\bRyzen\b|\bRyzen\b/i.test(name);
  const intel = /\bIntel\b/i.test(name);
  const ryzen9600x = /\bRyzen\s+5\s+9600X\b/i.test(name);
  return {
    name: name || 'Procesador no identificado',
    vendor: amd ? 'amd' : intel ? 'intel' : 'other',
    candidate: amd,
    supported: ryzen9600x,
    external: amd,
    directControl: false,
    canConfigurePbo: ryzen9600x,
    note: ryzen9600x
      ? 'Ryzen 5 9600X detectado. Admite PBO y Curve Optimizer. VORTEX prepara perfiles y compara mediciones; los limites se aplican desde Ryzen Master o la BIOS.'
      : amd
        ? 'Ryzen detectado. Ryzen Master puede ofrecer controles segun el modelo y la placa. Los perfiles PPT/TDC/EDC de esta version estan preparados para el Ryzen 5 9600X. VORTEX no modifica frecuencias ni voltajes.'
        : intel
          ? 'Esta version del modulo de ajuste esta limitada a AMD Ryzen. No se modificaran procesadores Intel.'
          : 'No se pudo confirmar un procesador AMD Ryzen compatible. No se modificaran frecuencias ni voltajes.'
  };
}

export function validatePboLimits(limits, maximum = RYZEN_5_9600X_STOCK_LIMITS) {
  const values = {
    ppt: Number(limits?.ppt),
    tdc: Number(limits?.tdc),
    edc: Number(limits?.edc)
  };
  const errors = [];
  for (const [key, label, unit] of [['ppt', 'PPT', 'W'], ['tdc', 'TDC', 'A'], ['edc', 'EDC', 'A']]) {
    if (!Number.isFinite(values[key]) || values[key] <= 0) errors.push(`${label} debe ser un numero mayor que cero.`);
    else if (values[key] > maximum[key]) errors.push(`${label} no puede superar la referencia de ${maximum[key]} ${unit} en el modo de ahorro.`);
  }
  if (Number.isFinite(values.tdc) && Number.isFinite(values.edc) && values.tdc > values.edc) errors.push('TDC no deberia superar EDC.');
  return { valid: errors.length === 0, values, errors };
}

export function cpuBaselineSummary(rows) {
  if (!Array.isArray(rows)) return { count: 0, averageUsage: null, averageGhz: null, peakUsage: null };
  const usages = rows.map(row => row?.cpuUsage).filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  const frequencies = rows.map(row => row?.cpuGHz).filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10);
  const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  return { count: rows.length, averageUsage: average(usages), averageGhz: average(frequencies), peakUsage: usages.length ? Math.round(Math.max(...usages)) : null };
}

export function compareCpuBenchmarks(reference, current) {
  if (!reference || !current || !Number.isFinite(reference.scoreMops) || !Number.isFinite(current.scoreMops) || reference.scoreMops <= 0) return null;
  const changePercent = Math.round((current.scoreMops / reference.scoreMops - 1) * 1000) / 10;
  return { referenceScore: reference.scoreMops, currentScore: current.scoreMops, changePercent, faster: changePercent > 0, difference: Math.round((current.scoreMops - reference.scoreMops) * 100) / 100 };
}

function csvNumber(value) {
  let text = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function csvFields(line, delimiter) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { fields.push(current); current = ''; }
    else current += char;
  }
  fields.push(current);
  return fields;
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}

export function parseCpuSensorCsv(source) {
  const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { valid: false, error: 'El archivo no contiene suficientes filas de sensores.' };
  const delimiter = [',', ';', '\t'].sort((a, b) => (lines[0].split(b).length - 1) - (lines[0].split(a).length - 1))[0];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let headerIndex = -1;
  let header = [];
  for (let index = 0; index < Math.min(lines.length, 12); index++) {
    const candidate = csvFields(lines[index], delimiter).map(normalize);
    if (candidate.some(value => value.includes('ppt')) && candidate.some(value => value.includes('tdc')) && candidate.some(value => value.includes('edc'))) {
      headerIndex = index;
      header = candidate;
      break;
    }
  }
  if (headerIndex < 0) return { valid: false, error: 'No se encontraron columnas PPT, TDC y EDC. Exporta un registro de sensores de Ryzen Master SDK o HWiNFO.' };
  const find = (token, exclude = '') => header.findIndex(value => value.includes(token) && (!exclude || !value.includes(exclude)));
  const indexes = {
    ppt: find('ppt', 'limit'),
    tdc: find('tdc', 'limit'),
    edc: find('edc', 'limit'),
    temperature: header.findIndex(value => value.includes('tctl') || value.includes('tdie') || (value.includes('cpu') && (value.includes('temp') || value.includes('temperature')))),
    packagePower: header.findIndex(value => value.includes('package power') || value.includes('cpu power'))
  };
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const fields = csvFields(line, delimiter);
    const row = {};
    for (const key of Object.keys(indexes)) {
      const column = indexes[key];
      row[key] = column >= 0 ? csvNumber(fields[column]) : null;
    }
    if (Object.values(row).some(Number.isFinite)) rows.push(row);
  }
  if (!rows.length) return { valid: false, error: 'Se encontro la cabecera, pero no hay lecturas numericas utilizables.' };
  const stats = key => {
    const values = rows.map(row => row[key]).filter(Number.isFinite);
    return { average: average(values), maximum: values.length ? Math.round(Math.max(...values) * 10) / 10 : null };
  };
  return {
    valid: true,
    sampleCount: rows.length,
    pptW: stats('ppt'),
    tdcA: stats('tdc'),
    edcA: stats('edc'),
    temperatureC: stats('temperature'),
    packagePowerW: stats('packagePower')
  };
}
