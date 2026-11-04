import test from 'node:test';
import assert from 'node:assert/strict';
import { percentLabel, decimalGb, memoryUsedTotal, clockLabel } from '../src/core/overview-display.js';

test('porcentajes enteros sin decimales y con valores ausentes', () => {
  assert.equal(percentLabel(3.45), '3%');
  assert.equal(percentLabel(2.6), '3%');
  assert.equal(percentLabel(0), '0%');
  assert.equal(percentLabel(null), 'No disponible');
  assert.equal(percentLabel(NaN), 'No disponible');
});

test('RAM usada y total aparecen con coma y un decimal', () => {
  const total = 15.6 * 1024 ** 3;
  const available = 3.6 * 1024 ** 3;
  assert.equal(memoryUsedTotal(total, available), '12,0 / 15,6 GB');
  assert.equal(memoryUsedTotal(total, null), 'No disponible');
  assert.equal(decimalGb(1.25 * 1024 ** 3), '1,3');
});

test('GHz del equipo muestra frecuencia y no inventa datos', () => {
  assert.equal(clockLabel(3.6), '3,6 GHz');
  assert.equal(clockLabel(null), 'No disponible');
});
