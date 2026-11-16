import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {normalizeCpuSensorFrame} from '../src/main/cpu-sensors.js';
import {createCpuSensorWorker} from '../src/main/cpu-sensor-worker.js';
import {createLiveMetricsController} from '../src/main/live-metrics.js';

const sensor=(Name,SensorType,Value,id=0)=>({Name,SensorType,Value,Identifier:`/amdcpu/0/${SensorType}/${id}`});
test('la frecuencia procede de muestras dinámicas y solo usa Windows como estimación explícita',()=>{
  const frame={status:'ready',sampledAt:1000,sensors:[sensor('Core #1','Clock',5000),sensor('Core #2','Clock',4500,1),sensor('Core (Tctl/Tdie)','Temperature',65),sensor('Core (SVI2 TFN)','Voltage',1.25)],windowsClock:{averageMHz:3900,peakMHz:3900}};
  const native=normalizeCpuSensorFrame(frame);
  assert.equal(native.cpuGHz,4.75);assert.equal(native.peakClockMHz,5000);assert.equal(native.frequencyEstimated,false);assert.equal(native.temperatureC,65);assert.equal(native.cpuVoltageV,1.25);
  const fallback=normalizeCpuSensorFrame({...frame,status:'access-denied',windowsClock:{averageMHz:4785,peakMHz:5343}});
  assert.equal(fallback.temperatureC,null);assert.equal(fallback.cpuGHz,4.785);assert.equal(fallback.frequencyEstimated,true);assert.equal(fallback.peakEstimated,true);
  const missing=normalizeCpuSensorFrame({status:'stale',sensors:[],windowsClock:null});assert.equal(missing.cpuGHz,null);assert.equal(missing.peakClockMHz,null);
});
test('la frecuencia de sistema se actualiza incluso en la caché y no queda fijada a os.cpus',async()=>{
  let now=1000;let sample={cpuGHz:4.3,sampledAt:now};let total=1000;
  const controller=createLiveMetricsController({clock:()=>now,cpuTimes:()=>({total:total+=100,idle:10}),cpuSensorSampler:()=>sample,ram:()=>({total:100,available:60})});
  assert.equal((await controller.snapshot()).cpuGHz,4.3);
  sample={cpuGHz:5.2,sampledAt:now};now+=100;assert.equal((await controller.snapshot()).cpuGHz,5.2);
  now+=6000;assert.equal((await controller.snapshot()).cpuGHz,null);
});
test('el lector comparte un único proceso, admite JSON parcial y descarta valores antiguos',async()=>{
  let now=1000;let launches=0;let child;
  const worker=createCpuSensorWorker({directory:'test',normalize:normalizeCpuSensorFrame,clock:()=>now,spawnProcess:()=>{
    launches++;child=new EventEmitter();child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr=new EventEmitter();child.kill=()=>{child.killed=true;};return child;
  }});
  worker.latest();const pending=worker.snapshot();assert.equal(launches,1);
  const line=JSON.stringify({status:'ready',sensors:[sensor('Core #1','Clock',5100)],sampledAt:1000})+'\n';
  child.stdout.emit('data',line.slice(0,20));child.stdout.emit('data',line.slice(20));
  assert.equal((await pending).cpuGHz,5.1);assert.equal(worker.latest().peakClockMHz,5100);
  now=7000;assert.equal(worker.latest().sensorStatus,'stale');assert.equal(worker.latest().peakClockMHz,null);
  worker.dispose();assert.equal(child.killed,true);
});

test('los sensores de solo lectura no habilitan tuning y se puede volver a conectar', async () => {
  let now = 1000;
  let child;
  const outputs = [];
  const frame = () => ({ status: 'ready', sensors: [], sampledAt: now, smu: { tuning: { supported: true, fingerprint: 'active' } } });
  const worker = createCpuSensorWorker({
    directory: 'test', normalize: normalizeCpuSensorFrame, clock: () => now,
    spawnProcess: () => {
      child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    },
    launchElevated: async (_, output) => {
      outputs.push(output);
      fs.writeFileSync(output, JSON.stringify(frame()));
      return { launched: true };
    }
  });
  const publishReadOnly = () => child.stdout.emit('data', `${JSON.stringify(frame())}\n`);
  try {
    worker.start();
    publishReadOnly();
    assert.equal(worker.latest().tuning.supported, true);
    assert.equal(worker.latest().tuningReady, false);
    await assert.rejects(worker.tune(null, 'active', 'undo'), /Conectar CPU/);

    await Promise.all([worker.elevate(), worker.elevate()]);
    assert.equal(outputs.length, 1);
    assert.equal(worker.latest().tuningReady, true);

    now += 6000;
    assert.equal(worker.latest().tuningReady, false);
    await worker.elevate();
    assert.equal(outputs.length, 2);
    assert.equal(worker.latest().tuningReady, true);

    worker.restart();
    publishReadOnly();
    assert.equal(worker.latest().tuning.supported, true);
    assert.equal(worker.latest().tuningReady, false);
  } finally {
    worker.dispose();
    for (const output of outputs) {
      for (const file of [output, `${output}.stop`]) if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.rmdirSync(path.dirname(output));
    }
  }
});
