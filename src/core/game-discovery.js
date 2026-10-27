const knownGames = new Set(['valorant-win64-shipping']);

export function isKnownGameProcess(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/\.exe$/, '');
  return knownGames.has(normalized);
}

export function isGameProcessCandidate(process) {
  return Boolean(process?.visible) || isKnownGameProcess(process?.name);
}

export function canModifyGameProcess(process) {
  return Number.isInteger(process?.pid) && typeof process?.started === 'string' && process.started.length > 10;
}
