import { randomUUID } from 'node:crypto';
import { nativeTuningTarget } from '../core/cpu-native.js';
import { BENCHMARK_MAX_SECONDS, BOOST_STEPS, CPU_VALIDATION_DURATIONS, RYZEN_9600X_BOOST_ZERO_MHZ, RYZEN_9600X_MAX_BOOST_TARGET_MHZ, rankBenchmarkProfiles, sweepBoostLimit } from '../core/cpu-benchmark-analysis.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const key = target => [target.limits.ppt, target.limits.tdc, target.limits.edc, target.scalar, target.fmaxMHz, ...target.curveOptimizer].join(':');
const limitsToTest = [['ppt', 'W'], ['tdc', 'A'], ['edc', 'A']];

function* profileStages(maxBoostMHz) {
  yield seed => [
    { label: 'CO: 5 pasos menos', target: { ...seed, curveOptimizer: seed.curveOptimizer.map(value => Math.max(-30, value - 5)) } },
    { label: 'CO: 5 pasos hacia cero', target: { ...seed, curveOptimizer: seed.curveOptimizer.map(value => value - Math.sign(value) * Math.min(5, Math.abs(value))) } }
  ];
  for (const [field, unit] of limitsToTest) {
    yield seed => [0.9, 0.8].map(ratio => {
      const minimum = field === 'edc' ? seed.limits.tdc : field === 'ppt' ? 10 : 1;
      const value = Math.max(minimum, Math.floor(seed.limits[field] * ratio));
      return { label: `${field.toUpperCase()} ${value} ${unit}`, target: { ...seed, limits: { ...seed.limits, [field]: value } } };
    });
  }
  if (maxBoostMHz > 0) {
    yield seed => BOOST_STEPS.filter(boost => boost > 0 && boost <= maxBoostMHz).map(boost => ({
      label: `Boost +${boost} MHz`, boostMHz: boost,
      target: { ...seed, fmaxMHz: RYZEN_9600X_BOOST_ZERO_MHZ + boost }
    }));
  }
}

export function createCpuProfileSweep({ read, tune, runBenchmark, stopBenchmark, readHardwareEvents, onResult = () => {}, wait = pause, clock = Date.now }) {
  let state = { running: false, results: [] };
  let validation = null;
  let task;
  let cancelled;
  let fault;
  let analysis = null;
  let analyzing = false;
  const isRunning = () => state.running || validation?.running === true;
  const status = () => structuredClone({ ...state, running: isRunning(), validation });

  function healthy(frame, ceiling) {
    if (frame.tuningReady === false || !frame.tuning?.supported || !Number.isFinite(frame.temperatureC) || !Number.isFinite(frame.pptW)) {
      throw new Error('Se perdió la lectura de temperatura, PPT o configuración de CPU.');
    }
    if (frame.temperatureC >= ceiling) throw new Error(`Se alcanzó el límite de prueba de ${ceiling} °C.`);
  }

  function inspect(frame) {
    const boostLimit = sweepBoostLimit(frame.tuning);
    if (boostLimit === null || !Number.isFinite(frame.thermalLimitC)) {
      throw new Error(frame.tuning?.error || 'La búsqueda automática requiere un Ryzen 5 9600X o Ryzen 7 9800X3D con firmware compatible.');
    }
    if (!frame.tuningReady) throw new Error('Conecta la CPU antes de analizarla.');
    const ceiling = Math.min(85, Math.floor(frame.thermalLimitC - 10));
    healthy(frame, ceiling);
    const baseline = nativeTuningTarget(frame.tuning, frame.tuning);
    if (key(baseline) !== frame.tuning.fingerprint) throw new Error('No se pudo confirmar la configuración activa.');
    return { baseline, ceiling, boostLimit };
  }

  async function analyze() {
    if (isRunning() || analyzing) throw new Error('Ya hay una operación de CPU en curso.');
    analyzing = true;
    analysis = null;
    try {
      const first = read();
      const { baseline, ceiling, boostLimit } = inspect(first);
      const fingerprint = first.tuning.fingerprint;
      const samples = [first];
      for (let attempt = 0; attempt < 12 && samples.length < 3; attempt++) {
        await wait(500);
        const frame = read();
        const current = inspect(frame);
        if (frame.tuning.fingerprint !== fingerprint || current.ceiling !== ceiling) {
          throw new Error('La configuración cambió durante el análisis. Vuelve a iniciar.');
        }
        if (frame.sampledAt > samples.at(-1).sampledAt) samples.push(frame);
      }
      if (samples.length < 3) throw new Error('No llegaron tres muestras nuevas del lector. Comprueba la conexión de CPU.');
      analysis = { id: randomUUID(), fingerprint, ceiling, boostLimit, cpu: first.tuning.cpu,
        configuration: baseline, temperatureC: Math.max(...samples.map(frame => frame.temperatureC)) };
      return structuredClone(analysis);
    } finally {
      analyzing = false;
    }
  }

  async function readExpected(expected, allowedPrevious = expected) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const frame = read();
      const fingerprint = frame.tuning?.supported && frame.tuning.fingerprint;
      if (fingerprint === expected) return frame;
      if (fingerprint && fingerprint !== allowedPrevious) throw new Error('La configuración de la CPU cambió fuera de la prueba.');
      await wait(500);
    }
    throw new Error('No llegó una lectura actualizada de la configuración.');
  }

  async function execute(run, baseline, candidates, options, ceiling, stages) {
    const original = key(baseline);
    const scheduled = new Set([original]);
    let current = original;
    let pending = null;
    try {
      for (const [index, candidate] of candidates.entries()) {
        if (cancelled) break;
        run.phase = 'Enfriando';
        const target = key(candidate.target);
        let frame = await readExpected(current);
        for (let attempt = 0; frame.temperatureC > ceiling - 5 && attempt < 60 && !cancelled; attempt++) {
          healthy(frame, ceiling);
          await wait(1000);
          frame = await readExpected(current);
        }
        if (cancelled) break;
        healthy(frame, ceiling);
        if (frame.temperatureC > ceiling - 5) throw new Error('La CPU no se enfrió lo suficiente para continuar.');
        run.current = index + 1;
        run.profile = candidate.label;
        const hardwareWindowStart = candidate.role ? clock() : null;
        if (target !== current) {
          run.phase = 'Aplicando y verificando';
          pending = target;
          const reply = await tune(candidate.target, current);
          if (reply.after?.fingerprint !== target) throw new Error('El firmware devolvió una configuración distinta.');
          const before = current;
          current = target;
          frame = await readExpected(current, before);
          pending = null;
        }
        if (cancelled) break;
        healthy(frame, ceiling);
        run.phase = 'Midiendo';
        const monitor = setInterval(() => {
          if (fault || cancelled) return;
          try {
            const latest = read();
            healthy(latest, ceiling);
            if (latest.tuning.fingerprint !== current) throw new Error('La configuración cambió durante el benchmark.');
          } catch (error) {
            fault = error;
            void stopBenchmark().catch(() => {});
          }
        }, 500);
        try {
          const durationSeconds = candidate.durationSeconds ?? options.durationSeconds;
          const result = await runBenchmark({ ...options, durationSeconds, configuration: frame.tuning });
          if (cancelled || fault) break;
          const finalFrame = read();
          healthy(finalFrame, ceiling);
          if (finalFrame.tuning.fingerprint !== current) throw new Error('La configuración cambió durante el benchmark.');
          if (result.sensors?.maxTemperatureC >= ceiling) throw new Error(`Se alcanzó el límite de prueba de ${ceiling} °C.`);
          if (!Number.isFinite(result.scoreMops) || result.scoreMops <= 0 ||
            result.configuration?.fingerprint !== current || !(result.sensors?.temperatureSamples >= Math.ceil(durationSeconds / 2))) {
            throw new Error('El perfil no reunió suficientes muestras válidas.');
          }
          const row = { ...result, label: candidate.label, boostMHz: candidate.boostMHz ?? null };
          if (candidate.role) {
            run.phase = 'Consultando errores de hardware';
            await wait(1000);
            if (cancelled || fault) break;
            let events = null;
            try { events = await readHardwareEvents(hardwareWindowStart, clock()); } catch {}
            if (cancelled || fault) break;
            run.results.push({ ...row, role: candidate.role, validationSeconds: durationSeconds, hardwareEvents: events });
            if (events?.length) {
              run.hardwareErrors = true;
              throw new Error('Windows registró errores de hardware durante la prueba.');
            }
          } else {
            run.results.push(row);
            try { onResult(result); }
            catch { run.historyError = 'No se pudo guardar un resultado de la ronda en el historial.'; }
          }
        } finally {
          clearInterval(monitor);
        }
        if (stages && index === candidates.length - 1) {
          const preferred = rankBenchmarkProfiles(run.results)[run.objective][0];
          const seed = preferred ? nativeTuningTarget(preferred.configuration, preferred.configuration) : baseline;
          while (index === candidates.length - 1) {
            const stage = stages.next();
            if (stage.done) break;
            for (const next of stage.value(seed)) {
              const fingerprint = key(next.target);
              if (scheduled.has(fingerprint)) continue;
              scheduled.add(fingerprint);
              candidates.push(next);
            }
          }
        }
      }
    } catch (error) {
      if (!fault && !cancelled) fault = error;
    } finally {
      run.phase = 'Restaurando configuración inicial';
      try {
        if (pending) await wait(1500);
        let frame = read();
        for (let attempt = 0; !frame.tuning?.supported && attempt < 12; attempt++) {
          await wait(500);
          frame = read();
        }
        const actual = frame.tuning?.supported && frame.tuning.fingerprint;
        if (!actual || ![original, current, pending].includes(actual)) throw new Error('No se pudo identificar la configuración activa.');
        if (actual !== original || pending) {
          await tune(baseline, actual);
          await readExpected(original, actual);
        }
        run.restored = true;
      } catch (error) {
        run.restoreError = error.message;
      }
      run.error = fault?.message ?? null;
      run.cancelled = cancelled;
      run.running = false;
      run.phase = null;
      if (!run.cancelled && !run.error) run.total = run.current;
    }
  }

  function start({ durationSeconds, workerCount, maxBoostMHz, analysisId, objective = 'balanced' } = {}) {
    if (isRunning() || analyzing) throw new Error('Ya hay una operación de CPU en curso.');
    if (!['performance', 'balanced'].includes(objective)) throw new Error('Selecciona un objetivo de búsqueda válido.');
    if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > BENCHMARK_MAX_SECONDS || !Number.isInteger(workerCount) || workerCount < 1) {
      throw new Error('Selecciona una duración y cantidad de hilos válidas.');
    }
    const frame = read();
    const { baseline, ceiling, boostLimit: limit } = inspect(frame);
    if (!analysis || analysis.id !== analysisId || analysis.fingerprint !== frame.tuning.fingerprint || analysis.ceiling !== ceiling) {
      throw new Error('Pulsa Analizar CPU para comprobar la configuración activa antes de buscar perfiles.');
    }
    if (!Number.isInteger(maxBoostMHz) || maxBoostMHz < 0 || maxBoostMHz % 25 !== 0 || maxBoostMHz > limit) {
      throw new Error(`El aumento máximo disponible sobre la referencia de fábrica es +${limit} MHz.`);
    }
    analysis = null;
    cancelled = false;
    fault = null;
    state = { running: true, current: 0, total: 9 + maxBoostMHz / 25, ceiling, maxBoostMHz, objective, results: [] };
    validation = null;
    task = execute(state, baseline, [{ label: 'Configuración inicial', target: baseline }],
      { durationSeconds, workerCount }, ceiling, profileStages(maxBoostMHz));
    return status();
  }

  function startValidation({ resultId, expectedFingerprint } = {}) {
    if (isRunning() || analyzing) throw new Error('Ya hay una operación de CPU en curso.');
    const measured = state.results.find(row => row.id === resultId);
    if (!state.restored || state.error || state.cancelled || typeof resultId !== 'string' || !measured) {
      throw new Error('Elige un perfil de una búsqueda completada.');
    }
    const frame = read();
    const { baseline, ceiling } = inspect(frame);
    if (frame.tuning.fingerprint !== expectedFingerprint) throw new Error('Cambió el perfil activo. Revisa los valores antes de validar.');
    const target = nativeTuningTarget(measured.configuration, frame.tuning);
    if (target.fmaxMHz > RYZEN_9600X_MAX_BOOST_TARGET_MHZ && target.fmaxMHz !== baseline.fmaxMHz) {
      throw new Error('El perfil medido supera el límite de boost de VORTEX.');
    }
    const candidates = CPU_VALIDATION_DURATIONS.flatMap(durationSeconds => {
      const trial = { label: `Candidato · ${durationSeconds} s`, role: 'candidate', target, durationSeconds };
      if (key(target) === key(baseline)) return [trial];
      return [{ label: `Perfil activo · ${durationSeconds} s`, role: 'baseline', target: baseline, durationSeconds }, trial];
    });
    analysis = null;
    cancelled = false;
    fault = null;
    validation = { running: true, current: 0, total: candidates.length, ceiling, resultId, results: [] };
    task = execute(validation, baseline, candidates, { workerCount: measured.workerCount }, ceiling);
    return status();
  }

  async function stop() {
    if (isRunning()) {
      cancelled = true;
      await stopBenchmark();
      await task;
    }
    return status();
  }

  return { analyze, start, startValidation, stop, status, isRunning };
}
