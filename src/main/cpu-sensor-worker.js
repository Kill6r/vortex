import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { nativeTuningTarget } from '../core/cpu-native.js';
import { executeJson } from './powershell.js';

export function createCpuSensorWorker({ directory, normalize, spawnProcess = spawn, launchElevated = command => executeJson(command), clock = Date.now, onFrame = () => {} } = {}) {
  let child = null;
  let last = null;
  let retryAt = 0;
  let disposed = false;
  let waiters = [];
  let elevatedFile = null;
  let elevatedTimer = null;
  let elevatedStartedAt = null;
  let elevation = null;
  let tuningBusy = false;
  const starting = () => ({...normalize({sensors:[],status:'starting'}),sampledAt:null,tuningReady:false});
  function publish(frame) {
    try { onFrame(frame); } catch {}
    last = normalize(frame);
    for(const resolve of waiters.splice(0))resolve(latest());
  }
  function start() {
    if(disposed || elevatedFile || child || clock()<retryAt)return;
    let current;
    try {
      const shell=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      current=spawnProcess(shell,['-NoProfile','-NonInteractive','-File',path.join(directory,'collect.ps1'),'-LibraryDirectory',path.join(directory,'lib'),'-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      child=current;
    }catch{retryAt=clock()+5000;publish({sensors:[],status:'sensor-error',error:'No se pudo iniciar el lector de sensores.'});return;}
    let buffer='';
    current.stdout.setEncoding('utf8');
    current.stdout.on('data',chunk=>{
      if(child!==current)return;
      buffer+=chunk;
      if(buffer.length>2_000_000){current.kill();return;}
      let index;
      while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);try{const frame=JSON.parse(line);if(Array.isArray(frame?.sensors))publish(frame);}catch{}}
    });
    current.stderr.on('data',()=>{});
    const ended=()=>{if(child!==current)return;child=null;retryAt=clock()+5000;publish({sensors:[],status:'sensor-error',error:'El lector se detuvo. VORTEX reintentará la conexión.'});};
    current.once('error',ended);current.once('exit',ended);
  }
  function latest() {
    start();
    const tuningConnecting = Boolean(elevation || (elevatedFile && !last && clock() - elevatedStartedAt < 5000));
    if(!last)return {...starting(), tuningConnecting};
    if(!Number.isFinite(last.sampledAt)||clock()-last.sampledAt>5000)return {...normalize({sensors:[],status:'stale'}),sampledAt:null,tuningReady:false,tuningConnecting};
    const tuningReady = Boolean(elevatedFile && last.sensorStatus === 'ready' && last.tuning?.supported);
    return {...last, tuningReady, tuningConnecting};
  }
  async function snapshot() {
    start();
    if(last)return latest();
    return new Promise(resolve=>{
      const done=value=>{clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>{waiters=waiters.filter(value=>value!==done);resolve(latest());},5000);
      waiters.push(done);
    });
  }
  function stopElevated() {
    clearInterval(elevatedTimer);elevatedTimer=null;
    if(elevatedFile){try{fs.writeFileSync(`${elevatedFile}.stop`,'stop');}catch{}}
    elevatedFile=null;
    elevatedStartedAt=null;
  }
  async function connectElevated() {
    if(disposed)throw new Error('El lector ya está cerrado.');
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vortex-cpu-monitor-'));
    const output=path.join(folder,'snapshot.json');
    const shell=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const quote=value=>`'${String(value).replace(/'/g,"''")}'`;
    const args=['-NoProfile','-NonInteractive','-File',`"${path.join(directory,'collect.ps1')}"`,'-LibraryDirectory',`"${path.join(directory,'lib')}"`,'-ParentProcessId',String(process.pid),'-OutputFile',`"${output}"`,'-EnableTuning'];
    const result=await launchElevated(`$p=Start-Process -FilePath ${quote(shell)} -ArgumentList @(${args.map(quote).join(',')}) -Verb RunAs -WindowStyle Hidden -PassThru -ErrorAction Stop; [pscustomobject]@{launched=($null -ne $p);pid=$p.Id} | ConvertTo-Json -Compress`, output);
    if(!result?.launched)throw new Error('No se concedió permiso para leer los sensores.');
    if(disposed){try{fs.writeFileSync(`${output}.stop`,'stop');}catch{}return result;}
    stopElevated();
    const old=child;child=null;old?.kill();last=null;elevatedFile=output;elevatedStartedAt=clock();
    const read=()=>{try{const frame=JSON.parse(fs.readFileSync(output,'utf8'));if(Number.isFinite(frame.sampledAt) && frame.sampledAt!==last?.sampledAt)publish(frame);}catch{}};
    elevatedTimer=setInterval(read,500);elevatedTimer.unref();read();
    return result;
  }
  async function elevate() {
    if (elevation) return elevation;
    if (tuningBusy) throw new Error('Espera a que termine el ajuste de CPU.');
    const status = latest();
    if (status.tuningReady || status.tuningConnecting) return {launched:true};
    elevation = connectElevated().finally(() => { elevation = null; });
    return elevation;
  }
  function restart() {
    if (tuningBusy || elevation) throw new Error('Espera a que termine la operación de CPU.');
    stopElevated();const old=child;child=null;last=null;retryAt=0;old?.kill();start();
  }
  function dispose() {disposed=true;stopElevated();const old=child;child=null;old?.kill();for(const resolve of waiters.splice(0))resolve(starting());}
  async function tune(input, expectedFingerprint, action = 'apply') {
    if(tuningBusy)throw new Error('Ya hay un cambio de CPU en curso.');
    const current=latest();
    if(!current.tuningReady)throw new Error(current.tuning?.error || 'La conexión para aplicar ajustes no está disponible. Pulsa Conectar CPU y acepta el permiso de Windows.');
    if(typeof expectedFingerprint!=='string' || expectedFingerprint!==current.tuning.fingerprint)throw new Error('Actualiza la configuración actual antes de aplicar.');
    const target=action==='undo'?null:nativeTuningTarget(input);
    tuningBusy=true;
    const id=randomUUID();
    const file=elevatedFile;
    try{
      const tmp=`${file}.request.tmp`;
      fs.writeFileSync(tmp,JSON.stringify({id,action,target,expectedFingerprint,expiresAt:clock()+45000}));
      fs.renameSync(tmp,`${file}.request.json`);
      const started=clock();
      while(!disposed && clock()-started<45000){
        await new Promise(resolve=>setTimeout(resolve,100));
        let reply;try{reply=JSON.parse(fs.readFileSync(`${file}.reply.json`,'utf8'));}catch{continue;}
        if(reply.id!==id)continue;
        if(!reply.ok)throw new Error(reply.error || 'El firmware no confirmó el cambio.');
        return reply;
      }
      throw new Error('No llegó la confirmación del firmware. Comprueba el estado actual antes de volver a aplicar.');
    }finally{tuningBusy=false;}
  }
  return { start, latest, snapshot, restart, elevate, dispose, tune };
}
