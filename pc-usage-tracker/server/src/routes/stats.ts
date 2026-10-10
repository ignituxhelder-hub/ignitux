import { Router } from 'express';
import type { StatsService } from '../services/statsService';

export function createStatsRouter(statsService: StatsService): Router {
  const router = Router();

  router.get('/dashboard', (_req, res) => {
    res.json(statsService.getDashboard());
  });

  return router;
}
