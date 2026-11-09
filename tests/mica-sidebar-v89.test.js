import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('VORTEX v0.89 incluye Mica nativo sin exigir compatibilidad a todos los Windows', () => {
  const main = read('../src/main/index.js');
  assert.match(main, /process\.platform === 'win32'/);
  assert.match(main, /typeof window\.setBackgroundMaterial === 'function'/);
  assert.match(main, /setBackgroundMaterial\('mica'\)/);
  assert.match(main, /catch \{\}/);
});

test('el indicador lateral se mueve con las dimensiones reales del apartado seleccionado', () => {
  const app = read('../src/renderer/App.jsx');
  assert.match(app, /useLayoutEffect/);
  assert.match(app, /querySelector\('\.nav-item\.selected'\)/);
  assert.match(app, /getBoundingClientRect\(\)/);
  assert.match(app, /v89-nav-indicator/);
  assert.match(app, /--v89-indicator-y/);
  assert.match(app, /ResizeObserver/);
  assert.match(app, /v0\.90/);
});

test('el acrilico evita aplicar blur a todas las tarjetas y respeta movimiento reducido', () => {
  const styles = read('../src/renderer/v89.css');
  assert.match(styles, /backdrop-filter:blur\(22px\)/);
  assert.match(styles, /backdrop-filter:none!important/);
  assert.match(styles, /v89SceneIn/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /\.v89-nav-indicator/);
});
