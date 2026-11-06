import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNvidiaBarReport, readNvidiaBarReport } from '../src/main/nvidia-bar-probe.js';
import { summarizeRebarResources } from '../src/core/rebar-status.js';

test('interpreta la BAR1 real del controlador y la distingue de una suposicion PCI', () => {
  const rows = parseNvidiaBarReport('GPU 00000000:01:00.0\n Product Name : NVIDIA GeForce RTX 3050\n BAR1 Memory Usage\n Total : 8192 MiB\n Used : 3 MiB\n Free : 8189 MiB');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bar1Bytes, 8 * 1024 ** 3);
  const status = summarizeRebarResources([], [], rows);
  assert.equal(status.state, 'large-bar');
  assert.equal(status.confidence, 'driver');
});

test('la lectura del controlador no convierte ausencia de datos en estado inactivo', async () => {
  const rows = await readNvidiaBarReport(async () => ({ stdout: 'BAR1 Memory Usage\n Total : N/A' }), { ProgramFiles: 'C:\\Archivos', SystemRoot: 'C:\\Windows' });
  assert.deepEqual(rows, []);
  assert.equal(summarizeRebarResources([], ['NVIDIA GeForce']).state, 'unknown');
});
