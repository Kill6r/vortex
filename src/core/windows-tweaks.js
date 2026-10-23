export const visualSettings = Object.freeze({
  animations: { title: 'Animaciones de ventanas', description: 'Reduce los efectos al minimizar y maximizar ventanas. No modifica los juegos.', path: 'HKCU\\Control Panel\\Desktop\\WindowMetrics', property: 'MinAnimate' },
  transparency: { title: 'Transparencia de Windows', description: 'Desactiva los fondos translúcidos de la interfaz de Windows.', path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', property: 'EnableTransparency' }
});

export function validateVisualChoice(key, enabled) {
  if (!Object.hasOwn(visualSettings, key) || typeof enabled !== 'boolean') throw new Error('Ajuste visual no admitido.');
  return { key, enabled };
}

export function validateStartupIo(exe, level) {
  if (typeof exe !== 'string' || exe.length > 120 || !/^[a-zA-Z0-9_ ()+.-]+\.exe$/i.test(exe) || exe.includes('..')) throw new Error('Selecciona un ejecutable .exe valido.');
  if (![null, 'VeryLow', 'Low', 'Normal', 'High'].includes(level)) throw new Error('Prioridad de E/S no admitida.');
  return { exe, level };
}

export const ioRegistryValues = Object.freeze({ VeryLow: 0, Low: 1, Normal: 2, High: 3 });

export function ioLevelFromRegistry(value) {
  if (value === null || value === undefined) return null;
  return Object.keys(ioRegistryValues).find(key => ioRegistryValues[key] === Number(value)) ?? null;
}

export function describeRebar(gpus = []) {
  const nvidia = gpus.some(gpu => /nvidia/i.test(gpu));
  return { state: 'unknown', vendor: nvidia ? 'NVIDIA' : 'Otro o desconocido',
    description: nvidia ? 'Comprueba Resizable BAR en Panel de control de NVIDIA > Informacion del sistema. Si aparece No, revisa la BIOS y los controladores.' : 'Comprueba Resizable BAR desde la utilidad del fabricante de tu GPU y BIOS. No hay una consulta de Windows universal y fiable.' };
}
