import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extraTweaks, getExtraTweak, getTweakMeta } from '../src/core/extra-tweaks.js';

const extraUi = fs.readFileSync(new URL('../src/renderer/ExtraTweaksPage.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/renderer/v91.css', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../src/main/preload.cjs', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const tweaksUi = fs.readFileSync(new URL('../src/renderer/TweaksPage.jsx', import.meta.url), 'utf8');

test('el catalogo crece con 45 tweaks independientes y categorias diferenciadas', () => {
  assert.ok(extraTweaks.length >= 45);
  assert.equal(new Set(extraTweaks.map(t => t.id)).size, extraTweaks.length);
  for (const category of ['Personalizacion', 'Escritorio', 'Rendimiento', 'Juegos', 'Privacidad', 'IA']) {
    assert.ok(extraTweaks.some(t => t.category === category), category);
  }
  for (const tweak of extraTweaks) {
    assert.ok(Array.isArray(tweak.values) && tweak.values.length > 0, tweak.id);
    for (const setting of tweak.values) {
      assert.match(setting.path, /^HK(?:CU|LM):\\/);
      assert.equal(setting.path.includes('\b'), false);
      assert.ok(['DWord','String'].includes(setting.type));
      assert.notEqual(setting.on, setting.off);
    }
    assert.ok(['safe','caution','high'].includes(getTweakMeta(tweak).risk));
  }
});

test('las etiquetas reconocen opciones de rendimiento, gaming, privacidad e IA', () => {
  assert.ok(getTweakMeta(getExtraTweak('menu-speed')).tags.includes('performance'));
  assert.ok(getTweakMeta(getExtraTweak('game-mode')).tags.includes('gaming'));
  assert.ok(getTweakMeta(getExtraTweak('disable-advertising-id')).tags.includes('privacy'));
  assert.ok(getTweakMeta(getExtraTweak('disable-copilot-legacy')).tags.includes('ai'));
  assert.equal(getTweakMeta(getExtraTweak('disable-recall-snapshots')).risk, 'high');
  assert.equal(getTweakMeta(getExtraTweak('disable-consumer-features')).requiresAdmin, true);
});

test('el interruptor sustituye activar y desactivar con un unico control accesible', () => {
  assert.match(extraUi, /role="switch"/);
  assert.match(extraUi, /aria-checked=\{state === true\}/);
  assert.match(extraUi, /v91-switch-on/);
  assert.match(extraUi, /state === null \|\| state === undefined/);
  assert.match(extraUi, /getTweakMeta/);
  assert.match(extraUi, /Riesgo alto/);
  assert.match(css, /\.v91-switch-knob/);
  assert.doesNotMatch(extraUi, /vt-choice-off/);
  assert.doesNotMatch(extraUi, /vt-choice-on/);
});

test('el apartado de CPU y OC usa la pagina oficial de AMD y no ejecuta comandos de overclock', () => {
  assert.match(tweaksUi, /CpuTuningPage/);
  assert.match(index, /amd-ryzen-master/);
  assert.match(index, /www\.amd\.com\/es\/products\/software\/ryzen-master/);
  assert.match(preload, /openRyzenMaster/);
  assert.match(index, /system:open-ryzen-master/);
});
