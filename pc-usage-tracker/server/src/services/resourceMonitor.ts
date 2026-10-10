import si from 'systeminformation';
import type { ResourceSample } from '../types';

/**
 * L'utilisation GPU n'est disponible que sur certaines cartes/pilotes
 * (essentiellement NVIDIA sous Windows, via nvidia-smi). Quand
 * systeminformation ne peut pas la lire, on renvoie null plutôt qu'une
 * valeur inventée — le tableau de bord affiche alors « N/D ».
 */
export async function sampleResources(): Promise<ResourceSample> {
  const [load, mem, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.graphics().catch(() => null),
  ]);

  const gpuPercent =
    graphics?.controllers.find((controller) => typeof controller.utilizationGpu === 'number')
      ?.utilizationGpu ?? null;

  return {
    cpuPercent: load.currentLoad,
    ramUsedMb: mem.active / (1024 * 1024),
    gpuPercent,
  };
}
