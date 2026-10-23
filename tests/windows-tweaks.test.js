import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualChoice, validateStartupIo, ioLevelFromRegistry, describeRebar } from '../src/core/windows-tweaks.js';
import { changeStartupIoRule, restoreStartupIoRule, readGraphicsStatus, changeHags, restoreHags, readVisualSettings, changeVisualSetting, restoreVisualSetting } from '../src/main/windows-tweaks.js';

function createStore() {
  let content = {};
  return { read: () => ({ ...content }), write: next => { content = { ...content, ...next }; return { ...content }; } };
}

test('valida nombres de ejecutables sin permitir rutas ni comandos', () => {
  assert.deepEqual(validateStartupIo('VALORANT-Win64-Shipping.exe', 'High'), { exe: 'VALORANT-Win64-Shipping.exe', level: 'High' });
  assert.throws(() => validateStartupIo('C:\\Windows\\system.exe', 'High'));
  assert.throws(() => validateStartupIo('game.exe;Remove-Item', 'High'));
  assert.throws(() => validateStartupIo('game.exe', 'Critical'));
});

test('traduce prioridad de E/S del registro con valores admitidos', () => {
  assert.equal(ioLevelFromRegistry(3), 'High');
  assert.equal(ioLevelFromRegistry(2), 'Normal');
  assert.equal(ioLevelFromRegistry(null), null);
  assert.equal(ioLevelFromRegistry(8), null);
});

test('una regla E/S al inicio se guarda y restaura sin tocar otros ajustes', async () => {
  let io = 2;
  const scripts = [];
  const execute = async script => {
    scripts.push(script);
    if (script.includes('New-ItemProperty') && script.includes('IoPriority')) io = Number(script.match(/-Value (\d+)/)?.[1]);
    if (script.includes('Remove-ItemProperty') && script.includes('IoPriority')) io = null;
    return script.includes('Get-ItemProperty') ? { value: io } : { changed: true };
  };
  const store = createStore();
  const saved = await changeStartupIoRule('valorant.exe', 'High', store, execute);
  assert.equal(saved.verifiedRegistry, true);
  assert.equal(saved.effectiveVerified, false);
  assert.equal(io, 3);
  assert.equal(store.read().ioRegistryBackups['valorant.exe'], 2);
  await restoreStartupIoRule('valorant.exe', store, execute);
  assert.equal(io, 2);
  assert.ok(scripts.every(s => !s.includes('Debugger')));
});

test('HAGS comprueba el registro y nunca confunde esto con estar efectivo', async () => {
  let value = null;
  const execute = async script => {
    if (script.includes('New-ItemProperty')) value = Number(script.match(/-Value (\d+)/)?.[1]);
    if (script.includes('Remove-ItemProperty')) value = null;
    return script.includes('Get-ItemProperty') ? { value, registryValue: value } : { changed: true };
  };
  const store = createStore();
  const change = await changeHags(true, store, execute);
  assert.equal(change.requiresRestart, true);
  assert.equal(change.effectiveVerified, false);
  const status = await readGraphicsStatus(execute, async () => ({ gpus: ['NVIDIA GeForce'] }));
  assert.equal(status.hags, 'solicitado-activado');
  assert.equal(status.rebar.state, 'unknown');
  await restoreHags(store, execute);
  assert.equal(value, null);
});

test('los ajustes visuales se pueden restaurar', async () => {
  let animations = true;
  let transparency = true;
  const execute = async script => {
    if (script.includes('New-ItemProperty') && script.includes('MinAnimate')) animations = script.includes("-Value '1'");
    if (script.includes('Remove-ItemProperty') && script.includes('MinAnimate')) animations = null;
    if (script.includes('New-ItemProperty') && script.includes('EnableTransparency')) transparency = script.includes('-Value 1');
    if (script.includes('Remove-ItemProperty') && script.includes('EnableTransparency')) transparency = null;
    return script.includes('$animation =') ? { animations, transparency } : { changed: true };
  };
  const store = createStore();
  assert.equal((await readVisualSettings(execute)).animations, true);
  await changeVisualSetting('animations', false, store, execute);
  assert.equal(animations, false);
  await restoreVisualSetting('animations', store, execute);
  assert.equal(animations, true);
  assert.throws(() => validateVisualChoice('kernel', false));
});

test('la deteccion de ReBAR no inventa un estado activo', () => {
  assert.deepEqual(describeRebar(['AMD Radeon']).state, 'unknown');
  assert.deepEqual(describeRebar(['NVIDIA RTX']).state, 'unknown');
});