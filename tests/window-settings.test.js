import test from 'node:test';
import assert from 'node:assert/strict';
import { windowSettings } from '../src/core/window-settings.js';

test('X envia a bandeja por defecto y minimizar conserva la barra de tareas', () => {
  assert.equal(windowSettings().closeToTray, true);
});

test('permite desactivar cerrar a bandeja y migra el ajuste anterior', () => {
  assert.equal(windowSettings({ closeToTray: false }).closeToTray, false);
  assert.equal(windowSettings({ minimizeToTray: false }).closeToTray, false);
  assert.equal(windowSettings({ minimizeToTray: 'no' }).closeToTray, true);
});
