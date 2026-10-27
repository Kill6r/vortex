import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGamingController } from '../src/main/games.js';
import { isKnownGameProcess, isGameProcessCandidate, canModifyGameProcess } from '../src/core/game-discovery.js';
import { readAdvancedProcess, setAdvancedProcess } from '../src/main/native.js';

const started = '2026-10-27T20:15:00.0000000Z';

test('VALORANT se muestra aunque no tenga ventana principal', async () => {
  assert.equal(isKnownGameProcess('VALORANT-Win64-Shipping.exe'), true);
  assert.equal(isKnownGameProcess('VALORANT-Win64-Shipping'), true);
  assert.equal(isKnownGameProcess('VALORANT'), false);
  assert.equal(isGameProcessCandidate({ name: 'VALORANT-Win64-Shipping', visible: false }), true);
  assert.equal(isGameProcessCandidate({ name: 'svchost', visible: false }), false);
  assert.equal(isGameProcessCandidate({ name: 'chrome', visible: true }), true);
  const gaming = createGamingController({ listProcesses: async () => [{ name: 'VALORANT-Win64-Shipping', pid: 530, started, visible: false, priority: 'Normal', memory: 800000000, cpuSeconds: 25 }] });
  const rows = await gaming.list();
  assert.equal(rows[0].name, 'VALORANT-Win64-Shipping');
  assert.equal(rows[0].visible, false);
});

test('VALORANT sin hora de inicio se puede mostrar pero no modificar', () => {
  assert.equal(isGameProcessCandidate({ name: 'VALORANT-Win64-Shipping', visible: false, started: null }), true);
  assert.equal(canModifyGameProcess({ pid: 530, started: null }), false);
  assert.equal(canModifyGameProcess({ pid: 530, started }), true);
});

test('E/S Alta se interpreta segun el valor obtenido de Windows', async () => {
  const result = await readAdvancedProcess(530, started, async () => ({ io: 3, gpu: null, memory: null, efficiency: null, threadBoost: null }));
  assert.equal(result.io, 'High');
});

test('un rechazo de E/S devuelve el codigo real y no indica exito', async () => {
  await assert.rejects(setAdvancedProcess(530, started, 'io', 'High', async () => ({ status: -1073741790 })), /Windows rechazó la prioridad de E\/S \(0xC0000022\)/);
  await assert.rejects(setAdvancedProcess(530, started, 'io', 'High', async () => { throw new Error('Acceso denegado al proceso.'); }), /Vanguard o Windows/);
});

test('el gestor de procesos incluye el ejecutable sin ventana', () => {
  const source = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
  const windows = readFileSync(new URL('../src/main/processes.js', import.meta.url), 'utf8');
  assert.match(source, /group.entries.filter\(isGameProcessCandidate\)/);
  assert.match(windows, /isGameProcessCandidate\(process\)/);
  assert.match(windows, /VALORANT-Win64-Shipping/);
});

test('el instalador detecta versiones previas y conserva copias al restablecer ajustes', () => {
  const script = readFileSync(new URL('../build/installer.nsh', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../electron-builder.config.cjs', import.meta.url), 'utf8');
  assert.match(script, /ReadRegStr \$0 HKCU/);
  assert.match(script, /ReadRegStr \$0 HKLM/);
  assert.match(script, /IfSilent fin/);
  assert.match(script, /optimizer-settings.json.bak-/);
  assert.match(script, /game-rules.json.bak-/);
  assert.match(config, /include: 'build\/installer.nsh'/);
  assert.match(config, /deleteAppDataOnUninstall: false/);
});
