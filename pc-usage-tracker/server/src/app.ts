import cors from 'cors';
import express, { type Express } from 'express';
import type { SessionService } from './services/sessionService';
import type { SettingsService } from './services/settingsService';
import type { StatsService } from './services/statsService';
import { createHealthRouter } from './routes/health';
import { createSessionsRouter } from './routes/sessions';
import { createSettingsRouter } from './routes/settings';
import { createStatsRouter } from './routes/stats';

interface Services {
  sessionService: SessionService;
  statsService: StatsService;
  settingsService: SettingsService;
}

export function createApp(services: Services): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/health', createHealthRouter());
  app.use('/api/sessions', createSessionsRouter(services.sessionService));
  app.use('/api/stats', createStatsRouter(services.statsService));
  app.use('/api/settings', createSettingsRouter(services.settingsService));

  return app;
}
