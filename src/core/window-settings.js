export function windowSettings(value = {}) {
  return { minimizeToTray: value?.minimizeToTray !== false };
}
