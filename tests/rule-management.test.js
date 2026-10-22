import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRuleTarget, ruleMatchesProcess, findRuleForProcess, ruleTarget } from '../src/core/rule-management.js';
import { validateGameRule } from '../src/core/gaming.js';
import { createGamingController } from '../src/main/games.js';

const folder = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Juego\\juego.exe';
const started = '2026-10-21T20:35:19.0000000Z';

test('normaliza coincidencias por nombre y rutas completas de Windows', () => {
  assert.equal(normalizeRuleTarget('MiJuego.exe'), 'mijuego');
  assert.equal(normalizeRuleTarget(folder), folder.toLowerCase());
  assert.equal(normalizeRuleTarget('C:/Juegos/MiJuego.exe'), 'c:\\juegos\\mijuego.exe');
  assert.equal(ruleTarget({ name: 'MiJuego' }), 'mijuego');
});

test('rechaza reglas para procesos críticos, comodines y rutas relativas', () => {
  for (const target of ['svchost.exe', 'C:\\Windows\\System32\\lsass.exe', '*.exe', '..\\juego.exe', 'C:\\A\\..\\juego.exe', 'juego|comando.exe']) {
    assert.throws(() => normalizeRuleTarget(target), /regla|protegidos|válida|ruta|proceso/);
  }
});

test('coincide por nombre, pero exige ruta exacta para reglas por ubicación', () => {
  const process = { name: 'juego', path: folder };
  assert.equal(ruleMatchesProcess({ name: 'juego' }, process), true);
  assert.equal(ruleMatchesProcess({ match: folder }, process), true);
  assert.equal(ruleMatchesProcess({ match: 'C:\\Otro\\juego.exe' }, process), false);
  assert.equal(ruleMatchesProcess({ match: folder }, { name: 'juego' }), false);
  const chosen = findRuleForProcess([{ name: 'juego' }, { match: folder }], process);
  assert.equal(ruleTarget(chosen), folder.toLowerCase());
});

test('mantiene compatibilidad con reglas anteriores sin match', () => {
  const old = validateGameRule({ name: 'juego.exe', priority: 'AboveNormal', auto: true }, 12);
  assert.equal(old.match, 'juego');
  assert.equal(old.name, 'juego');
  assert.equal(old.auto, true);
});

test('permite guardar por ruta, renombrar, eliminar y conservar otras coincidencias', () => {
  let saved = [{ name: 'juego', priority: 'Normal', affinity: null, auto: false }];
  const controller = createGamingController({ cpuCount: 8, ruleStore: { read: () => saved, write: value => { saved = value; } } });
  controller.saveRule({ match: folder, priority: 'High', auto: true });
  assert.equal(controller.savedRules().length, 2);
  assert.equal(controller.savedRules().find(rule => rule.match.includes('\\')).priority, 'High');
  controller.saveRule({ match: 'C:\\Games\\Nuevo.exe', priority: 'Normal', auto: false }, folder);
  assert.equal(controller.savedRules().length, 2);
  assert.equal(controller.savedRules().some(rule => rule.match === folder.toLowerCase()), false);
  assert.equal(controller.deleteRule('juego').length, 1);
  assert.equal(controller.savedRules()[0].match, 'c:\\games\\nuevo.exe');
});

test('no permite sobrescribir otra regla al cambiar la coincidencia', () => {
  const controller = createGamingController({ cpuCount: 8, ruleStore: {
    read: () => [{ name: 'juego', priority: 'Normal' }, { name: 'otro', priority: 'High' }], write: () => {}
  } });
  assert.throws(() => controller.saveRule({ match: 'otro.exe', priority: 'High' }, 'juego.exe'), /Ya existe/);
});

test('el controlador prefiere la regla por ruta a la regla general del mismo nombre', async () => {
  let priority = 'Normal';
  const controller = createGamingController({ cpuCount: 8, ruleStore: {
    read: () => [{ name: 'juego', priority: 'AboveNormal' }, { match: folder, name: 'juego', priority: 'High' }], write: () => {}
  }, inspect: async pid => ({ pid, started, name: 'juego', path: folder, priority }), setPriority: async (_pid, next) => { priority = next; } });
  await controller.activate(502);
  assert.equal(priority, 'High');
  await controller.stop();
  assert.equal(priority, 'Normal');
});

test('preserva reglas locales anteriores en el mismo archivo al añadir otras nuevas', async () => {
  const { mkdtempSync, rmSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createGameProfileStore } = await import('../src/main/profiles.js');
  const directory = mkdtempSync(path.join(tmpdir(), 'vortex-rules-'));
  try {
    const old = [{ name: 'juego', priority: 'Normal', affinity: null, auto: false }];
    writeFileSync(path.join(directory, 'game-rules.json'), JSON.stringify(old));
    const store = createGameProfileStore(directory);
    const controller = createGamingController({ cpuCount: 8, ruleStore: store });
    controller.saveRule({ match: 'C:\\Games\\otro.exe', priority: 'High', auto: true });
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'game-rules.json'), 'utf8')).length, 2);
    assert.equal(createGamingController({ cpuCount: 8, ruleStore: store }).savedRules().length, 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
