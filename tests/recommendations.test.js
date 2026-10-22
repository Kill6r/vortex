import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendService, summarizeRecommendations } from '../src/core/recommendations.js';
import { validateServiceChange, normalizeStartMode } from '../src/core/validation.js';
import { defaultPreferences, findCatalogEntry } from '../src/core/catalog.js';

const fake = (name, windowsDescription = '') => ({ name, windowsDescription, startMode: 'Automatic', state: 'Running' });

test('conserva un servicio cuya función se utiliza', () => {
  const result = recommendService(fake('Spooler'), defaultPreferences, 8 * 1024 ** 3);
  assert.equal(result.level, 'keep');
  assert.equal(result.editable, true);
});

test('considera opcional el servicio cuando su función no se utiliza', () => {
  const result = recommendService(fake('Spooler'), { ...defaultPreferences, impresora: false }, 8 * 1024 ** 3);
  assert.equal(result.level, 'optional');
  assert.match(result.reason, /8 GB/);
});

test('utiliza las descripciones del sistema para servicios externos al catálogo', () => {
  const result = recommendService(fake('ServicioExterno', 'Gestiona una aplicación de terceros'));
  assert.equal(result.description, 'Gestiona una aplicación de terceros');
  assert.equal(result.level, 'other');
  assert.equal(result.advanced, true);
});

test('describe los servicios sin descripción disponible', () => {
  const result = recommendService(fake('ServicioExterno'));
  assert.match(result.description, /Windows no proporcionó/);
});

test('protege los servicios de seguridad de Windows', () => {
  assert.equal(recommendService(fake('WinDefend')).protected, true);
  assert.throws(() => validateServiceChange('WinDefend', 'Disabled', true), /crítico/);
  assert.throws(() => validateServiceChange('RpcSs', 'Manual', true), /crítico/);
});

test('impide modificar servicios externos sin autorización avanzada', () => {
  assert.throws(() => validateServiceChange('ServicioExterno', 'Disabled'), /modo avanzado/);
  assert.deepEqual(validateServiceChange('ServicioExterno', 'Disabled', true), {
    name: 'ServicioExterno', mode: 'Disabled', advanced: true
  });
});

test('mantiene cambios habituales para servicios opcionales', () => {
  assert.equal(validateServiceChange('Spooler', 'Manual').mode, 'Manual');
});

test('exige modo avanzado para servicios que pueden ser importantes', () => {
  assert.throws(() => validateServiceChange('wuauserv', 'Disabled'), /modo avanzado/);
  assert.equal(validateServiceChange('wuauserv', 'Manual', true).mode, 'Manual');
});

test('rechaza nombres inválidos o intentos de inyección', () => {
  assert.throws(() => validateServiceChange("Spooler'; Remove-Item", 'Manual', true), /inválido/);
  assert.throws(() => validateServiceChange('', 'Manual', true), /inválido/);
});

test('no acepta modos de inicio arbitrarios', () => {
  assert.throws(() => validateServiceChange('Spooler', 'Realtime'), /no permitido/);
});

test('normaliza modos de inicio de Windows', () => {
  assert.equal(normalizeStartMode('Auto'), 'Automatic');
  assert.equal(normalizeStartMode('Disabled'), 'Disabled');
  assert.equal(normalizeStartMode('Delayed'), 'AutomaticDelayed');
  assert.equal(validateServiceChange('Spooler', 'AutomaticDelayed').mode, 'AutomaticDelayed');
  assert.equal(normalizeStartMode('Boot'), null);
});

test('resume las recomendaciones sin saturar la sección de evaluación', () => {
  const result = summarizeRecommendations([
    fake('Spooler'), fake('WinDefend'), fake('Desconocido'), fake('SysMain')
  ], { ...defaultPreferences, impresora: false }, 16 * 1024 ** 3);
  assert.deepEqual(result, { keep: 1, optional: 1, consider: 1, other: 1 });
});

test('reconoce servicios por usuario con sufijo y nombres insensibles a mayúsculas', () => {
  assert.equal(findCatalogEntry('OneSyncSvc_12abc').title, 'Sincronización de usuario');
  assert.equal(findCatalogEntry('SPOOLER').title, 'Cola de impresión');
});
