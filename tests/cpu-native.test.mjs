import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeTuningTarget} from '../src/core/cpu-native.js';
import {normalizeCpuSensorFrame} from '../src/main/cpu-sensors.js';
import {validateCpuProfile} from '../src/core/cpu-dashboard.js';
const target={limits:{ppt:95,tdc:60,edc:90},scalar:1,fmaxMHz:5625,curveOptimizer:[-30,-15,0,5,10,-5]};
test('native targets accept actual limits and reject malformed/out-of-range writes',()=>{
  assert.deepEqual(nativeTuningTarget({...target,arbitraryCommand:123}),target);
  for(const invalid of [{...target,scalar:11},{...target,fmaxMHz:5801},{...target,curveOptimizer:[0]},{...target,curveOptimizer:[0,0,0,0,0,11]},{...target,limits:{...target.limits,ppt:'95'}},{...target,limits:{...target.limits,tdc:91}},{...target,limits:{...target.limits,ppt:NaN}}])assert.throws(()=>nativeTuningTarget(invalid));
  const p=validateCpuProfile({...target,name:'Actual',cpu:'Ryzen 5 9600X',coreCount:6,curveMode:'per-core',boostOverrideMHz:0});
  assert.equal(p.valid,true);assert.equal(p.profile.fmaxMHz,5625);
});
test('only fresh authorized SMU frames supply bounded live telemetry',()=>{
  const frame={status:'ready',sampledAt:123,sensors:[],smu:{tuning:{supported:true,...target},pptW:65,tdcA:28,edcLimitA:90,cpuVoltageV:1.36,socVoltageV:1.19,socPowerW:14.7,fabricClockMHz:2000}};
  const result=normalizeCpuSensorFrame(frame);
  assert.equal(result.pptW,65);assert.equal(result.edcA,null);assert.equal(result.edcLimitA,90);assert.equal(result.fabricClockMHz,2000);assert.equal(result.tuning.supported,true);
  assert.equal(normalizeCpuSensorFrame({...frame,status:'access-denied'}).pptW,null);
  assert.equal(normalizeCpuSensorFrame({...frame,status:'stale'}).tuning.supported,false);
  assert.equal(normalizeCpuSensorFrame({...frame,smu:{...frame.smu,cpuVoltageV:99}}).cpuVoltageV,null);
});
test('PowerShell firmware transactions run against fake hardware only', {skip:process.platform!=='win32'},()=>{
  const output=execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./cpu-native-transaction.ps1',import.meta.url))],{encoding:'utf8'});
  assert.match(output,/PASS:/);
});
