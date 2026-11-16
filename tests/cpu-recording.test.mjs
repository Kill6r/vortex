import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpuRecordingController } from '../src/main/cpu-recording.js';
import { executeJson, executePowerShell } from '../src/main/powershell.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(extra = {}) {
  const files = new Map();
  const tasks = [];
  const storage = {
    readFileSync: key => { if (!files.has(key)) throw Error('missing'); return files.get(key); },
    writeFileSync: (key, data) => files.set(key, data),
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); }
  };
  const options = { filename: 'recording.json', storage, sample: async () => ({cpuUsage: 25, cpuGHz: 4}), setTimer: fn => { tasks.push(fn); return fn; }, clearTimer: fn => { const i = tasks.indexOf(fn); if (i >= 0) tasks.splice(i, 1); }, ...extra };
  return { controller: createCpuRecordingController(options), tasks, files, options };
}

test('la grabación sigue sin oyentes, conserva muestras y se recupera del disco', async () => {
  const h = harness();
  h.controller.start();
  await flush();
  assert.equal(h.controller.status().sampleCount, 1);
  const recovered = createCpuRecordingController(h.options).status();
  assert.equal(recovered.result.sampleCount, 1);
  assert.equal(recovered.result.recovered, true);
  h.tasks.shift()(); await flush();
  assert.equal(h.controller.status().sampleCount, 2);
  const stopped = h.controller.stop();
  assert.equal(stopped.result.cpuUsage.average, 25);
  assert.equal(stopped.result.temperatureC.average, null);
  assert.equal(stopped.result.rows, undefined);
  assert.equal(JSON.parse(h.files.get('recording.json')).rows.length, 2);
  assert.equal(h.tasks.length, 0);
});

test('una lectura tardía no contamina una grabación reiniciada', async () => {
  const resolvers = [];
  const h = harness({sample: () => new Promise(resolve => resolvers.push(resolve))});
  h.controller.start(); h.controller.stop(); h.controller.start();
  resolvers[0]({cpuUsage:99}); await flush();
  assert.equal(h.controller.status().sampleCount, 0);
  resolvers[1]({cpuUsage:12}); await flush();
  assert.equal(h.controller.stop().result.cpuUsage.average, 12);
});

test('fallos de lectura y disco son visibles, recuperables y no lanzan al renderizador', async () => {
  let fail = true;
  const h = harness({ sample: async () => { if (fail) throw Error('lectura fallida'); return {cpuUsage:0}; }, storage: {readFileSync:()=>null, writeFileSync:()=>{throw Error('disco lleno');}} });
  h.controller.start(); await flush();
  assert.match(h.controller.status().error,/lectura fallida/);
  fail = false; h.tasks.shift()(); await flush();
  assert.match(h.controller.status().error,/guardar/);
  assert.equal(h.controller.stop().result.cpuUsage.average, 0);
});

test('la grabación se detiene en el límite y tolera archivos antiguos dañados', async () => {
  const h=harness({maxSamples:1}); h.controller.start(); await flush();
  assert.equal(h.controller.status().running,false);
  assert.equal(h.controller.status().result.sampleCount,1);
  assert.equal(h.tasks.length,0);
  const broken=harness({storage:{readFileSync:()=>'{broken'}});
  assert.equal(broken.controller.status().result,null);
});

test('PowerShell ejecuta consultas largas con Unicode sin ENAMETOOLONG', {skip: process.platform !== 'win32'}, async () => {
  const text = 'lectura de núcleos ✓';
  const script = `$unused = '${'x'.repeat(40000)}'; [pscustomobject]@{text='${text}'; count=3} | ConvertTo-Json -Compress`;
  assert.deepEqual(await executeJson(script), {text,count:3});
  await assert.rejects(executePowerShell("throw 'fallo controlado'"));
});
