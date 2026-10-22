import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePowerShellText, explainWindowsError, extractPowerShellError } from '../src/core/errors.js';

test('convierte la salida CLIXML de PowerShell en texto breve', () => {
  const data = '#< CLIXML\n<Objs Version="1.1.0.1"><S S="Error">No se pudo localizar el ejecutable del proceso._x000D__x000A_En línea: 8 Carácter: 134</S></Objs>';
  assert.match(extractPowerShellError(data), /No se pudo localizar/);
  assert.equal(explainWindowsError(data), 'No se pudo localizar el archivo .exe. Prueba con otra aplicación o ejecútala como administrador.');
  assert.ok(!explainWindowsError(data).includes('<Objs'));
});

test('reduce errores de permisos, tiempos y operaciones nativas', () => {
  assert.match(explainWindowsError('Access is denied'), /acceso/);
  assert.match(explainWindowsError('timeout'), /tardó/);
  assert.match(explainWindowsError('NTSTATUS -1073741781'), /caché/);
});

test('decodifica caracteres CLIXML sin mostrar etiquetas', () => {
  assert.equal(decodePowerShellText('Error_x000D__x000A_Acceso &lt;denegado&gt;'), 'Error\r\nAcceso <denegado>');
});
