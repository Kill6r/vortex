import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamingController } from '../src/main/games.js';

const started = '2026-10-21T20:35:19.0000000Z';

function setup() {
  let priority = 'Normal';
  const calls = [];
  const controller = createGamingController({
    listProcesses: async () => [{ pid: 900, name: 'MiJuego' }],
    inspect: async pid => ({ pid, name: 'MiJuego', started, priority }),
    setPriority: async (pid, mode, key) => {
      assert.equal(pid, 900);
      assert.equal(key, started);
      priority = mode;
      calls.push(mode);
    }
  });
  return { controller, calls, changePriority: next => { priority = next; } };
}

test('modo juego prioriza y restaura la prioridad original', async () => {
  const { controller, calls } = setup();
  assert.equal((await controller.list()).length, 1);
  await controller.activate(900);
  assert.equal(controller.status().appliedPriority, 'AboveNormal');
  assert.equal((await controller.stop()).restored, true);
  assert.equal(controller.status(), null);
  assert.deepEqual(calls, ['AboveNormal', 'Normal']);
});

test('modo juego impide iniciar perfiles simultáneos', async () => {
  const { controller } = setup();
  await controller.activate(900);
  await assert.rejects(controller.activate(900), /Termina el perfil/);
  await controller.stop();
});

test('modo juego no pisa cambios de prioridad ajenos', async () => {
  const { controller, calls, changePriority } = setup();
  await controller.activate(900);
  changePriority('High');
  await assert.rejects(controller.stop(), /fuera de VORTEX/);
  assert.equal(controller.status().pid, 900);
  assert.deepEqual(calls, ['AboveNormal']);
});
