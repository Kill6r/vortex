import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function createHistoryStore(directory) {
  const file = path.join(directory, 'historial.json');

  async function read() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('No se puede leer el historial. No se realizará ninguna modificación.');
    }
  }

  async function save(items) {
    await mkdir(directory, { recursive: true });
    const temp = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
    await rename(temp, file);
  }

  async function append(change) {
    const items = await read();
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), restoredAt: null, ...change };
    await save([record, ...items].slice(0, 200));
    return record;
  }

  async function markRestored(id) {
    const items = await read();
    const record = items.find(item => item.id === id);
    if (!record || record.restoredAt) throw new Error('Esta operación ya se restauró o no existe.');
    record.restoredAt = new Date().toISOString();
    await save(items);
    return record;
  }

  return { read, append, markRestored };
}
