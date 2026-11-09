export function clampUpdatePercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function readDownloadProgress(info = {}) {
  const total = Number.isFinite(info.total) && info.total > 0 ? info.total : null;
  const transferred = Number.isFinite(info.transferred) && info.transferred >= 0 ? info.transferred : null;
  const reported = clampUpdatePercent(info.percent);
  const calculated = total && transferred !== null ? clampUpdatePercent(transferred / total * 100) : null;
  const speed = Number.isFinite(info.bytesPerSecond) && info.bytesPerSecond > 0 ? info.bytesPerSecond : null;
  return {
    progress: reported ?? calculated,
    transferred,
    total,
    bytesPerSecond: speed
  };
}

export function updateProgressView(status) {
  const state = status?.state;
  const checking = state === 'checking';
  const waiting = state === 'available';
  const downloading = state === 'downloading';
  const ready = state === 'ready';
  const active = checking || waiting || downloading || ready;
  const percent = ready ? 100 : downloading ? clampUpdatePercent(status?.progress) : null;
  const label = checking ? 'Comprobando versiones en GitHub' : waiting ? 'Preparando descarga' : downloading ? 'Descargando actualización' : ready ? 'Descarga completa' : '';
  return { state, active, indeterminate: checking || waiting || (downloading && percent === null), percent, label };
}
