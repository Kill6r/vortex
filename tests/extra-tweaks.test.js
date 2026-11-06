import test from 'node:test';
import assert from 'node:assert/strict';
import { extraTweaks, inferExtraTweakState, getExtraTweak } from '../src/core/extra-tweaks.js';
import { setExtraTweak, restoreExtraTweak } from '../src/main/extra-tweaks.js';

test('los tweaks incluyen opciones de juegos, escritorio y privacidad', () => {
  assert.ok(extraTweaks.length >= 12);
  assert.ok(extraTweaks.some(x => x.category === 'Juegos'));
  assert.ok(extraTweaks.some(x => x.category === 'Privacidad'));
  assert.equal(getExtraTweak('deshabilitar-defender'), null);
  assert.equal(inferExtraTweakState(getExtraTweak('clock-seconds'), [1]), true);
  assert.equal(inferExtraTweakState(getExtraTweak('clock-seconds'), [0]), false);
  assert.equal(inferExtraTweakState(getExtraTweak('clock-seconds'), [null]), null);
});

test('cada tweak valida su id y permite recuperar valores anteriores', async () => {
  let current = null;
  let config = {};
  const settings = { read: () => config, write: obj => { config = { ...config, ...obj }; } };
  const query = async script => {
    if (script.includes('ConvertTo-Json -InputObject $out')) return [{ id: 'clock-seconds', values: [{ value: current }] }];
    if (script.includes('Remove-ItemProperty')) current = null;
    else if (script.includes('New-ItemProperty')) current = script.includes("-Value '1'") ? 1 : 0;
    return { changed: true };
  };
  await assert.rejects(setExtraTweak('deshabilitar-defender', true, settings, query), /disponible/);
  const result = await setExtraTweak('clock-seconds', true, settings, query);
  assert.equal(result.enabled, true);
  assert.equal(current, 1);
  assert.equal(config.extraTweakBackups['clock-seconds'][0], null);
  await restoreExtraTweak('clock-seconds', settings, query);
  assert.equal(current, null);
  assert.equal(config.extraTweakBackups['clock-seconds'], undefined);
});
