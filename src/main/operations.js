import { changeServiceStartup, inspectService } from './services.js';

export function createOperations(history) {
  let queue = Promise.resolve();

  const serialize = operation => {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  };

  async function change(name, mode, advanced = false) {
    return serialize(async () => {
      const result = await changeServiceStartup(name, mode, advanced);
      try {
        return await history.append(result);
      } catch {
        try {
          await changeServiceStartup(name, result.previousMode, true);
          throw new Error('No pudo guardarse el historial. Se restauró la configuración anterior.');
        } catch (error) {
          if (error.message.includes('Se restauró la configuración')) throw error;
          throw new Error('El servicio cambió, pero no pudo guardarse el historial ni revertirse. Revisa el Administrador de servicios.');
        }
      }
    });
  }

  async function restore(id) {
    return serialize(async () => {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) {
        throw new Error('Operación inválida.');
      }

      const items = await history.read();
      const item = items.find(record => record.id === id);
      if (!item || item.restoredAt) throw new Error('No existe una operación pendiente de restaurar.');

      const latest = items.find(record => record.name === item.name && !record.restoredAt);
      if (latest?.id !== id) throw new Error('Primero debes restaurar el cambio más reciente de este servicio.');

      const current = await inspectService(item.name);
      if (current.mode !== item.newMode) {
        throw new Error('La configuración cambió fuera de VORTEX. Revisa el servicio antes de restaurar.');
      }

      await changeServiceStartup(item.name, item.previousMode, true);
      return history.markRestored(id);
    });
  }

  return { change, restore };
}
