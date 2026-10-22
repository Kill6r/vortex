import { defaultPreferences, findCatalogEntry, isProtectedService } from './catalog.js';

export function recommendService(service, preferences = defaultPreferences, totalRam = 0) {
  const known = findCatalogEntry(service.name);
  const description = known?.description || service.windowsDescription?.trim() || 'Servicio instalado en el equipo. Windows no proporcionó una descripción de su función.';
  const lowMemory = totalRam > 0 && totalRam <= 8 * 1024 ** 3;

  if (isProtectedService(service.name)) {
    return {
      level: 'keep', title: 'Protegido', description,
      reason: 'Es un componente crítico de Windows. VORTEX bloquea sus modificaciones para evitar daños al sistema.',
      editable: false, advanced: false, protected: true, risk: 'crítico', featured: false
    };
  }

  if (known?.preference) {
    const inUse = preferences[known.preference] !== false;
    return {
      level: inUse ? 'keep' : 'optional', title: inUse ? 'En uso' : 'Opcional', description,
      reason: inUse
        ? 'Has indicado que utilizas esta función. Mantener su configuración reduce el riesgo de perderla.'
        : `${known.condition} Puedes valorar inicio manual o deshabilitado.${lowMemory ? ' Con 8 GB de RAM o menos conviene medir antes y después: el ahorro puede ser mínimo.' : ''}`,
      editable: true, advanced: known.risk === 'elevado', protected: false,
      risk: known.risk || 'moderado', featured: true
    };
  }

  if (known?.category === 'consider') {
    return {
      level: 'consider', title: 'Evaluar', description, reason: known.reason,
      editable: true, advanced: true, protected: false,
      risk: known.risk || 'elevado', featured: true
    };
  }

  if (known?.category === 'essential') {
    return {
      level: 'keep', title: 'Mantener', description,
      reason: known.reason || 'Este servicio presta una función del sistema que podrías necesitar.',
      editable: true, advanced: true, protected: false,
      risk: known.risk || 'elevado', featured: false
    };
  }

  return {
    level: 'other', title: 'Sin evaluar', description,
    reason: 'No hay una recomendación específica comprobada para este servicio. Consulta su descripción, las dependencias y los efectos antes de modificarlo.',
    editable: true, advanced: true, protected: false,
    risk: 'desconocido', featured: false
  };
}

export function summarizeRecommendations(services, preferences, totalRam) {
  return services.reduce((acc, service) => {
    const result = recommendService(service, preferences, totalRam);
    acc[result.level] = (acc[result.level] || 0) + 1;
    return acc;
  }, { keep: 0, optional: 0, consider: 0, other: 0 });
}
