import { getSystemOverview, getHvciStatus } from './main/system.js';
import { listWindowsServices } from './main/services.js';
import { recommendService } from './core/recommendations.js';
import { defaultPreferences } from './core/catalog.js';

const command = process.argv[2] || 'equipo';
const supported = ['equipo', 'servicios', 'hvci'];

async function main() {
  if (!supported.includes(command)) {
    throw new Error(`Comando desconocido. Opciones: ${supported.join(', ')}`);
  }

  if (command === 'equipo') {
    const data = await getSystemOverview();
    console.log(JSON.stringify(data, null, 2));
  }

  if (command === 'servicios') {
    const overview = await getSystemOverview();
    const services = await listWindowsServices();
    const result = services.map(service => ({
      nombre: service.name,
      visible: service.displayName,
      estado: service.state,
      inicio: service.startMode,
      recomendacion: recommendService(service, defaultPreferences, overview.ramTotal).title
    }));
    console.log(JSON.stringify(result, null, 2));
  }

  if (command === 'hvci') {
    console.log(JSON.stringify(await getHvciStatus(), null, 2));
  }
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
