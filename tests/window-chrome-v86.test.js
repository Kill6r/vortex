import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer/App.jsx', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../src/renderer/StartupPage.jsx', import.meta.url), 'utf8');
test('una sola barra de titulo integrada maneja minimizar, maximizar y cerrar', () => {
  assert.match(main, /frame: false/);
  assert.match(main, /window\.minimize\(\)/);
  assert.match(main, /window\.on\('close', event/);
  assert.doesNotMatch(main, /window\.on\('minimize', event/);
  assert.match(renderer, /v86-window-controls/);
  assert.match(renderer, /api\?\.minimizeWindow\(\)/);
  assert.match(renderer, /api\?\.closeWindow\(\)/);
  assert.match(settings, /Enviar a la bandeja al pulsar X/);
});
