import fs from 'node:fs';
import path from 'node:path';
import { validateMemoryProfileName } from '../core/telemetry.js';

export function createSettingsStore(userData, fileName = 'optimizer-settings.json') {
  const file = path.join(userData, fileName);
  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('No se pudo leer la configuración guardada.');
    }
  }
  function write(values) {
    const current = read();
    const updated = { ...current, ...values };
    const temp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(updated, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
    return updated;
  }
  function profiles() { return Object.entries(read().profiles || {}).map(([name, value]) => ({ name, ...value })); }
  function saveProfile(name, memory, standby) {
    const valid = validateMemoryProfileName(name);
    const config = read();
    const profiles = { ...config.profiles, [valid]: { memory, standby } };
    if (Object.keys(profiles).length > 20) throw new Error('Puedes guardar un máximo de 20 perfiles.');
    write({ profiles });
    return profiles;
  }
  function deleteProfile(name) {
    const valid = validateMemoryProfileName(name);
    const profiles = { ...read().profiles };
    delete profiles[valid];
    write({ profiles });
    return profiles;
  }
  return { read, write, profiles, saveProfile, deleteProfile };
}
