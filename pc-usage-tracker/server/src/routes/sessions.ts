import { Router } from 'express';
import type { SessionService } from '../services/sessionService';

export function createSessionsRouter(sessionService: SessionService): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(sessionService.listSessions(limit, offset));
  });

  router.get('/current', (_req, res) => {
    res.json(sessionService.getCurrentSession());
  });

  return router;
}
