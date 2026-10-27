import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../src/renderer/${file}`, import.meta.url), 'utf8');

test('la navegación ofrece Limpiar memoria sin una sección standby duplicada', () => {
  const app = read('App.jsx');
  assert.match(app, /label: 'Memoria RAM'/);
  assert.doesNotMatch(app, /id: 'standby'/);
  assert.match(app, /VERSIÓN 0\.82/);
});

test('la limpieza principal es conservadora y el vaciado completo requiere un diálogo', () => {
  const cleaner = read('MemoryCleaner.jsx');
  assert.match(cleaner, /useState\('low'\)/);
  assert.match(cleaner, /Limpiar memoria/);
  assert.match(cleaner, /Confirmar limpieza/);
  assert.doesNotMatch(cleaner, /VACIAR/);
  assert.match(cleaner, /mode === 'all'/);
});

test('seleccionar todos omite aplicaciones protegidas y en primer plano', () => {
  const memory = read('MemoryPage.jsx');
  assert.match(memory, /Seleccionar todos/);
  assert.match(memory, /processAllowed\(item\.name\)/);
  assert.match(memory, /entry\.foreground/);
  assert.match(memory, /const targetLimit = mode === 'intensiva' \? 30 : 8/);
});
