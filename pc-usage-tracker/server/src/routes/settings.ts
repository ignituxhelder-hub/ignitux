import { Router } from 'express';
import type { SettingsService } from '../services/settingsService';

export function createSettingsRouter(settingsService: SettingsService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(settingsService.getSettings());
  });

  router.put('/', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updated = settingsService.updateSettings({
      hourlyRateEur: body.hourlyRateEur !== undefined ? Number(body.hourlyRateEur) : undefined,
      containerNameFilter:
        body.containerNameFilter !== undefined ? String(body.containerNameFilter) : undefined,
      estimatedWattage: body.estimatedWattage !== undefined ? Number(body.estimatedWattage) : undefined,
      electricityPricePerKwh:
        body.electricityPricePerKwh !== undefined ? Number(body.electricityPricePerKwh) : undefined,
    });
    res.json(updated);
  });

  return router;
}
