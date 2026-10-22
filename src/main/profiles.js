import fs from 'node:fs';
import path from 'node:path';

export function createGameProfileStore(userData) {
  const file = path.join(userData, 'game-rules.json');

  function read() {
    try {
      const result = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(result) ? result : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('No se pudo leer el archivo de perfiles de juego.');
    }
  }

  function write(rules) {
    const temp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(rules, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
  }

  return { read, write };
}
