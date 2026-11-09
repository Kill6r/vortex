import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/renderer/App.jsx', import.meta.url), 'utf8');
const tweaks = fs.readFileSync(new URL('../src/renderer/WindowsTweaksPage.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/renderer/v85.css', import.meta.url), 'utf8');

test('Ajustes se encuentra en el menu lateral y no en el encabezado', () => {
  assert.match(app, /id: 'startup', label: 'Ajustes'/);
  assert.match(app, /className="v85-sidebar-settings"/);
  assert.doesNotMatch(app, /className=\{`header-settings/);
  assert.match(app, /VERSIÓN 0\.91/);
});

test('los estados de Tweaks indican seleccion activa en verde y desactiva en rojo', () => {
  assert.match(tweaks, /role="switch"/);
  assert.match(tweaks, /aria-checked=\{enabled === true\}/);
  assert.match(tweaks, /v91-switch-on/);
  assert.match(css, /\.vt-status-on/);
  assert.match(css, /\.vt-status-off/);
});

test('HAGS tiene boton de actualizar y la CPU conserva GHz en el panel', () => {
  assert.match(tweaks, /refresh=\{refresh\}/);
  assert.match(tweaks, /aria-label="Actualizar ReBAR"/);
  assert.match(app, /overview\.currentClockMHz/);
  assert.match(app, /clockLabel\(live\?\.cpuGHz/);
});
