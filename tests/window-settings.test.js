import test from 'node:test';
import assert from 'node:assert/strict';
import { windowSettings } from '../src/core/window-settings.js';

test('minimiza a bandeja de forma predeterminada', () => {
  assert.deepEqual(windowSettings(), { minimizeToTray: true });
});

test('permite desactivar la minimización automática', () => {
  assert.deepEqual(windowSettings({ minimizeToTray: false }), { minimizeToTray: false });
  assert.deepEqual(windowSettings({ minimizeToTray: 'no' }), { minimizeToTray: true });
});
