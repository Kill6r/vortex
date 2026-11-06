export function windowSettings(value = {}) {
  const closeToTray = typeof value?.closeToTray === 'boolean' ? value.closeToTray : value?.minimizeToTray !== false;
  return { closeToTray };
}
