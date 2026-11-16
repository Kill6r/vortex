import test from 'node:test';
import assert from 'node:assert/strict';
import {createCpuRecordingController} from '../src/main/cpu-recording.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(sample=async()=>({cpuUsage:25})){
  let now=1000;const deadlines=[];const files=new Map();
  const options={sample,filename:'recording.json',clock:()=>now,setTimer:()=>0,clearTimer:()=>{},setDeadlineTimer:(fn,delay)=>{const timer={fn,delay};deadlines.push(timer);return timer;},clearDeadlineTimer:timer=>{if(timer)timer.cleared=true;},storage:{readFileSync:key=>files.get(key)||'{}',writeFileSync:(key,data)=>files.set(key,data),renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);}}};
  return {controller:createCpuRecordingController(options),deadlines,files,options,setNow:value=>{now=value;}};
}
test('la duración seleccionada termina y guarda sin depender de la siguiente lectura',async()=>{
  let calls=0;let resolveLate;
  const f=fixture(()=>++calls===1?Promise.resolve({cpuUsage:20}):new Promise(resolve=>{resolveLate=resolve;}));
  f.controller.start({durationSeconds:60});await flush();
  assert.equal(f.deadlines[0].delay,60000);
  f.setNow(31000);assert.equal(f.controller.status().remainingSeconds,30);
  f.setNow(61000);f.deadlines[0].fn();
  const stopped=f.controller.status();assert.equal(stopped.running,false);assert.equal(stopped.result.stopReason,'duration');assert.equal(stopped.result.elapsedSeconds,60);
  assert.equal(JSON.parse(f.files.get('recording.json')).running,false);
  const reloaded=createCpuRecordingController(f.options).status();assert.equal(reloaded.result.durationSeconds,60);
});
test('parada manual cancela el límite y un temporizador anterior no afecta otra sesión',async()=>{
  const f=fixture();f.controller.start({durationSeconds:300});await flush();f.setNow(11000);f.controller.stop();
  assert.equal(f.deadlines[0].cleared,true);assert.equal(f.controller.status().result.stopReason,'manual');
  f.controller.start({durationSeconds:600});assert.equal(f.controller.status().sampleCount,0);
  f.deadlines[0].fn();assert.equal(f.controller.status().running,true);
  await flush();f.controller.stop();assert.equal(f.deadlines[1].cleared,true);
});
test('el límite funciona incluso si el proveedor está bloqueado y no acepta duraciones inválidas',async()=>{
  const f=fixture(()=>new Promise(()=>{}));
  for(const value of [0,-1,3601,NaN,Infinity,1.5,'60'])assert.throws(()=>f.controller.start({durationSeconds:value}));
  f.controller.start({durationSeconds:20});assert.equal(f.controller.status().durationSeconds,20);
  f.setNow(21000);f.deadlines[0].fn();assert.equal(f.controller.status().running,false);
});
