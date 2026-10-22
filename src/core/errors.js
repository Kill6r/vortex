const xmlEntities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodePowerShellText(text) {
  return String(text || '')
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, name) => {
      if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
      return xmlEntities[name.toLowerCase()] || '';
    });
}

export function extractPowerShellError(output) {
  const raw = String(output || '');
  if (!raw.includes('CLIXML') && !raw.includes('<Objs')) return decodePowerShellText(raw).trim();
  const matches = [...raw.matchAll(/<S\b[^>]*\bS="Error"[^>]*>([\s\S]*?)<\/S>/gi)]
    .map(match => decodePowerShellText(match[1]).trim()).filter(Boolean);
  if (matches.length) return matches.join(' ').trim();
  return decodePowerShellText(raw.replace(/<[^>]+>/g, ' ')).replace(/#\s*CLIXML/gi, ' ').trim();
}

export function explainWindowsError(input) {
  let text = extractPowerShellError(input).replace(/\s+/g, ' ').trim();
  if (!text) return 'Windows no pudo completar esta operación.';
  const conditions = [
    [/no se pudo localizar el ejecutable|cannot.*(find|access).*executable|unable.*(get|read).*path|path.*is null/i, 'No se pudo localizar el archivo .exe. Prueba con otra aplicación o ejecútala como administrador.'],
    [/access.*denied|acceso denegado|unauthorizedaccess|privilegio.*requerido|requires elevation|administrador/i, 'Windows rechazó el acceso. Prueba a abrir VORTEX como administrador.'],
    [/cannot find a process|no process was found|proceso.*no existe|no se encuentra.*proceso/i, 'El proceso ya no está abierto. Actualiza la lista e inténtalo de nuevo.'],
    [/Cannot.*(gpu|GPU)|no se pudo.*preferencia gr[aá]fica/i, 'No se pudo cambiar la preferencia de GPU en este proceso.'],
    [/ntstatus|ntset(systeminformation)?/i, 'Windows rechazó la limpieza de caché standby.'],
    [/timed?\s*out|timeout|tiempo de espera/i, 'La operación tardó demasiado y se canceló.'],
    [/operation was canceled|operaci[oó]n cancelada/i, 'La operación fue cancelada.']
  ];
  for (const [pattern, explanation] of conditions) if (pattern.test(text)) return explanation;
  text = text.replace(/^.*?(?:Exception calling|ErrorRecord|RuntimeException|CategoryInfo|FullyQualifiedErrorId)\s*[:：]/i, '').trim();
  text = text.replace(/\s+At line:\d+.*$/i, '').replace(/\s+En línea:\s*\d+.*$/i, '').trim();
  if (/<\/?(?:S|Objs|Obj)\b|\bStackTrace\b|\bat System\.|\bCategoryInfo\b|\bFullyQualifiedErrorId\b/i.test(text)) return 'Windows no pudo completar la operación. Consulta el registro de errores.';
  if (text.length > 180) return `${text.slice(0, 160).replace(/\s+\S*$/, '')}…`;
  return text;
}
