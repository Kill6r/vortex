export function validateStandbySchedule(value) {
  const enabled = value?.enabled === true;
  const mode = value?.mode;
  const minutes = Number(value?.intervalMinutes);
  if (mode === 'all') {
    throw new Error('El vaciado completo de standby está desactivado por seguridad. Selecciona solo baja prioridad.');
  }
  if (mode !== 'low' || !Number.isInteger(minutes) || minutes < 60 || minutes > 720) {
    throw new Error('Elige baja prioridad y un intervalo de 60 a 720 minutos.');
  }
  return { enabled, mode: 'low', intervalMinutes: minutes, acknowledged: false };
}
