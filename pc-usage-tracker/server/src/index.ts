import { createApp } from './app';
import { config } from './config';
import { openDatabase } from './db/database';
import { selectMatchingNames } from './docker/containerFilter';
import { DockerMonitor } from './docker/dockerMonitor';
import { SessionService } from './services/sessionService';
import { SettingsService } from './services/settingsService';
import { StatsService } from './services/statsService';

function main(): void {
  const db = openDatabase();
  const settingsService = new SettingsService(db);
  const sessionService = new SessionService(db, settingsService);
  const statsService = new StatsService(db, sessionService, settingsService);

  const monitor = new DockerMonitor();
  monitor.start(
    config.pollIntervalMs,
    (allNames) => {
      const { containerNameFilter } = settingsService.getSettings();
      const activeNames = selectMatchingNames(allNames, containerNameFilter);
      void sessionService.onActiveContainersChanged(activeNames).catch((error: unknown) => {
        console.error("[sessions] Échec de la mise à jour de la session en cours :", error);
      });
    },
    (error) => {
      console.error(
        '[docker-monitor] Impossible de contacter Docker (Docker Desktop est-il démarré ?) :',
        (error as Error).message,
      );
    },
  );

  const app = createApp({ sessionService, statsService, settingsService });
  const server = app.listen(config.port, () => {
    console.log(`Comptabilisation IGNITUX : API à l'écoute sur http://localhost:${config.port}`);
  });

  const shutdown = (): void => {
    monitor.stop();
    server.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
