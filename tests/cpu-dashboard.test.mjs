import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpuLibrary } from '../src/main/cpu-library.js';
import { chartSegments, gaugeStatus, validateCpuProfile, downsampleCpuRows } from '../src/core/cpu-dashboard.js';
import { compareCpuBenchmarks } from '../src/core/cpu-tuning.js';
import { normalizeCpuSensors } from '../src/main/cpu-sensors.js';

const profile = {name:'Diario', cpu:'AMD Ryzen 5 9600X',coreCount:6,limits:{ppt:75,tdc:65,edc:130},curveMode:'per-core',curveOptimizer:[-10,-15,0,5,10,-30],boostOverrideMHz:0,scalar:1};
const benchmark = {id:'test-1',scoreMops:100,workerCount:1,durationSeconds:20.1,testDurationSeconds:20,completedAt:'2026-11-11T20:00:00Z'};
function memoryStore() {
  const files=new Map();
  return {files,readFileSync:key=>files.get(key)||'{}',writeFileSync:(key,value)=>files.set(key,value),renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);}};
}
test('perfiles con nombre se guardan, actualizan, recargan y eliminan sin alterar el resto',()=>{
  const storage=memoryStore();
  const library=createCpuLibrary({filename:'cpu.json',storage});
  const first=library.saveProfile(profile).profiles[0];
  library.saveProfile({...profile,name:'Gaming'});
  const updated=library.saveProfile({...profile,name:'diario',scalar:2});
  assert.equal(updated.profiles.length,2);
  assert.equal(updated.profiles[0].id,first.id);
  const loaded=createCpuLibrary({filename:'cpu.json',storage});
  assert.equal(loaded.snapshot().profiles[0].scalar,2);
  assert.deepEqual(loaded.snapshot().profiles[0].curveOptimizer,profile.curveOptimizer);
  assert.equal(loaded.deleteProfile(first.id).profiles[0].name,'Gaming');
});
test('validación rechaza perfiles incoherentes y no cambia estado si falla el disco',()=>{
  assert.equal(validateCpuProfile({...profile,curveMode:'all'}).valid,false);
  assert.equal(validateCpuProfile({...profile,curveMode:'all',curveOptimizer:5}).valid,false);
  assert.equal(validateCpuProfile({...profile,boostOverrideMHz:201}).valid,false);
  assert.equal(validateCpuProfile({...profile,scalar:11}).valid,false);
  assert.equal(validateCpuProfile({...profile,name:' '}).valid,false);
  const storage=memoryStore();const library=createCpuLibrary({filename:'cpu.json',storage});
  library.saveProfile(profile);
  storage.writeFileSync=()=>{throw Error('disco lleno');};
  assert.throws(()=>library.saveProfile({...profile,name:'Nuevo'}));
  assert.equal(library.snapshot().profiles.length,1);
});
test('historial persiste, elimina duplicados, conserva 100 mediciones y compara pruebas equivalentes',()=>{
  const storage=memoryStore();const library=createCpuLibrary({filename:'cpu.json',storage});
  library.addBenchmark(benchmark,profile.cpu);library.addBenchmark(benchmark,profile.cpu);
  assert.equal(library.snapshot().benchmarks.length,1);
  assert.equal(createCpuLibrary({filename:'cpu.json',storage}).snapshot().benchmarks[0].scoreMops,100);
  for(let i=0;i<105;i++)library.addBenchmark({...benchmark,id:`row-${i}`},profile.cpu);
  assert.equal(library.snapshot().benchmarks.length,100);
  assert.equal(compareCpuBenchmarks({...benchmark,cpu:'A'},{...benchmark,cpu:'B'}),null);
  assert.equal(compareCpuBenchmarks(benchmark,{...benchmark,workerCount:2}),null);
  assert.equal(compareCpuBenchmarks(benchmark,{...benchmark,testDurationSeconds:30}),null);
  assert.equal(compareCpuBenchmarks(benchmark,{...benchmark,scoreMops:110}).changePercent,10);
  library.deleteBenchmark('row-104');assert.equal(library.snapshot().benchmarks.length,99);
});
test('indicadores distinguen ausencia de lectura, disponibilidad y límite real',()=>{
  assert.equal(gaugeStatus(null,95).level,'unknown');
  assert.equal(gaugeStatus(0,null).level,'ok');
  assert.equal(gaugeStatus(60,95).level,'ok');
  assert.equal(gaugeStatus(80,95).level,'warning');
  assert.equal(gaugeStatus(95,95).level,'danger');
});
test('gráficas no unen datos ausentes y el resumen conserva los extremos temporales',()=>{
  const rows=[{sampledAt:0,cpuUsage:0},{sampledAt:2000,cpuUsage:10},{sampledAt:4000,cpuUsage:null},{sampledAt:6000,cpuUsage:20}];
  assert.equal(chartSegments(rows,'cpuUsage').segments.length,2);
  assert.equal(chartSegments(rows,'temperatureC').segments.length,0);
  assert.equal(chartSegments([{sampledAt:0,cpuUsage:0},{sampledAt:10000,cpuUsage:10}],'cpuUsage').segments.length,2);
  const long=Array.from({length:1800},(_,i)=>({sampledAt:i}));
  const sample=downsampleCpuRows(long);
  assert.equal(sample.length,180);assert.equal(sample[0],long[0]);assert.equal(sample.at(-1),long.at(-1));
});
test('telemetría extendida no confunde VID con voltaje medido ni frecuencia Windows con pico',()=>{
  const row=(name,type,value,id=0)=>({Identifier:`/amdcpu/0/${type}/${id}`,Name:name,SensorType:type,Value:value});
  const sensors=normalizeCpuSensors([row('CPU Core VID','Voltage',1.4),row('CPU Core','Voltage',1.2,1),row('SoC','Power',12),row('Core #1','Clock',4800),row('Core #2','Clock',5100,1),row('CPU PPT Limit','Power',88)]);
  assert.equal(sensors.cpuVoltageV,1.2);assert.equal(sensors.socPowerW,12);assert.equal(sensors.peakClockMHz,5100);assert.equal(sensors.pptLimitW,88);assert.equal(sensors.pptW,null);
});
