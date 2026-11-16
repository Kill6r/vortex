export const BENCHMARK_MAX_SECONDS = 300;
export const BENCHMARK_VERSION = 2;
export const BOOST_STEPS = Array.from({ length: 9 }, (_, index) => index * 25);
// SMU FMax reference for the supported 9600X firmware, checked against the zero override.
export const RYZEN_9600X_BOOST_ZERO_MHZ = 5450;
export const RYZEN_9600X_MAX_OVERRIDE_MHZ = 200;
export const RYZEN_9600X_MAX_BOOST_TARGET_MHZ = RYZEN_9600X_BOOST_ZERO_MHZ + RYZEN_9600X_MAX_OVERRIDE_MHZ;

export function boostOverrideFromTargetMHz(targetMHz) {
  if (!Number.isInteger(targetMHz)) return null;
  const offset = targetMHz - RYZEN_9600X_BOOST_ZERO_MHZ;
  return BOOST_STEPS.includes(offset) ? offset : null;
}

export function sweepBoostLimit(tuning) {
  if (!tuning?.supported || !/\b9600X\b/i.test(tuning.cpu) || tuning.tableVersion !== '0x00620105' || !Number.isFinite(tuning.fmaxMHz)) return null;
  return RYZEN_9600X_MAX_OVERRIDE_MHZ;
}

export function summarizeBenchmarkSensors(samples) {
  const readings = key => samples.map(sample => sample[key]).filter(Number.isFinite);
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const max = values => values.length ? Math.max(...values) : null;
  const temperature = readings('temperatureC');
  const peakGHz = samples.filter(sample => !sample.peakEstimated && Number.isFinite(sample.peakClockMHz))
    .map(sample => sample.peakClockMHz / 1000);
  return {
    temperatureSamples: temperature.length,
    averageTemperatureC: mean(temperature),
    maxTemperatureC: max(temperature),
    averagePptW: mean(readings('pptW')),
    averagePowerW: mean(readings('packagePowerW')),
    averagePeakGHz: mean(peakGHz),
    maxPeakGHz: max(peakGHz)
  };
}

export function benchmarkProfileRecommendations(rows, cpu, threads, duration, version = BENCHMARK_VERSION) {
  const candidates = rows.filter(row => row.cpu === cpu && row.workerCount === threads &&
    (row.benchmarkVersion ?? 1) === version && row.testDurationSeconds === duration && row.configuration && row.sensors && row.scoreMops > 0 &&
    row.sensors.temperatureSamples >= Math.ceil(duration / 2));
  return rankBenchmarkProfiles(candidates);
}

export function rankBenchmarkProfiles(candidates) {
  const best = Math.max(0, ...candidates.map(row => row.scoreMops));
  const comparable = candidates.filter(row => row.scoreMops >= best * 0.97);
  const unique = rows => rows.filter((row, index) => rows.findIndex(other =>
    other.configuration.fingerprint === row.configuration.fingerprint) === index);
  return {
    performance: unique([...candidates].sort((a, b) => b.scoreMops - a.scoreMops || a.sensors.maxTemperatureC - b.sensors.maxTemperatureC)).slice(0, 2),
    balanced: unique(comparable.filter(row => Number.isFinite(row.sensors.maxTemperatureC))
      .sort((a, b) => a.sensors.maxTemperatureC - b.sensors.maxTemperatureC ||
        (a.sensors.averagePptW ?? Infinity) - (b.sensors.averagePptW ?? Infinity) || b.scoreMops - a.scoreMops)).slice(0, 2)
  };
}
