export function percentLabel(value) {
  return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(100, value)))}%` : 'No disponible';
}

export function decimalGb(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  return (value / 1024 ** 3).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function memoryUsedTotal(total, available) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available)) return 'No disponible';
  const used = Math.max(0, total - Math.max(0, Math.min(total, available)));
  return `${decimalGb(used)} / ${decimalGb(total)} GB`;
}

export function clockLabel(ghz) {
  return Number.isFinite(ghz) && ghz > 0 ? `${ghz.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GHz` : 'No disponible';
}
