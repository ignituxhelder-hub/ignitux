import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/database';
import { SessionService } from '../src/services/sessionService';
import { SettingsService } from '../src/services/settingsService';

jest.mock('../src/services/resourceMonitor', () => ({
  sampleResources: jest.fn().mockResolvedValue({ cpuPercent: 10, ramUsedMb: 2048, gpuPercent: null }),
}));

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('SessionService', () => {
  it("ouvre une session quand des conteneurs IGNITUX deviennent actifs", async () => {
    const db = createTestDb();
    const sessions = new SessionService(db, new SettingsService(db));

    await sessions.onActiveContainersChanged(['ignitux-backend-1']);

    const current = sessions.getCurrentSession();
    expect(current).not.toBeNull();
    expect(current?.containerNames).toEqual(['ignitux-backend-1']);
    expect(current?.endTime).toBeNull();
  });

  it("ne fait rien de plus si aucun conteneur n'est actif et qu'aucune session n'est ouverte", async () => {
    const db = createTestDb();
    const sessions = new SessionService(db, new SettingsService(db));

    await sessions.onActiveContainersChanged([]);

    expect(sessions.getCurrentSession()).toBeNull();
    expect(sessions.listSessions(10, 0)).toEqual([]);
  });

  it('fusionne les nouveaux conteneurs détectés dans la session en cours', async () => {
    const db = createTestDb();
    const sessions = new SessionService(db, new SettingsService(db));

    await sessions.onActiveContainersChanged(['ignitux-backend-1']);
    await sessions.onActiveContainersChanged(['ignitux-backend-1', 'ignitux-frontend-1']);

    const current = sessions.getCurrentSession();
    expect(current?.containerNames).toEqual(['ignitux-backend-1', 'ignitux-frontend-1']);
  });

  it('ferme la session et calcule le montant dû à partir du tarif figé à son ouverture', async () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    settings.updateSettings({ hourlyRateEur: 1 }); // 1 €/h simplifie le calcul attendu
    const sessions = new SessionService(db, settings);

    await sessions.onActiveContainersChanged(['ignitux-backend-1']);
    const opened = sessions.getCurrentSession();
    expect(opened).not.toBeNull();

    // Recule artificiellement l'heure de départ pour simuler une session de 2h,
    // sans dépendre d'un vrai délai d'exécution.
    db.prepare('UPDATE sessions SET start_time = ? WHERE id = ?').run(
      new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      opened!.id,
    );

    await sessions.onActiveContainersChanged([]);

    expect(sessions.getCurrentSession()).toBeNull();
    const closed = sessions.listSessions(1, 0)[0];
    expect(closed).toBeDefined();
    expect(closed!.endTime).not.toBeNull();
    expect(closed!.durationSeconds).toBeGreaterThanOrEqual(2 * 3600 - 2);
    expect(closed!.amountDueEur).toBeCloseTo(2, 1); // 2h à 1 €/h
  });

  it('change le tarif appliqué au tarif courant seulement pour les nouvelles sessions', async () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    const sessions = new SessionService(db, settings);

    settings.updateSettings({ hourlyRateEur: 0.5 });
    await sessions.onActiveContainersChanged(['ignitux-backend-1']);
    await sessions.onActiveContainersChanged([]);

    settings.updateSettings({ hourlyRateEur: 2 });
    await sessions.onActiveContainersChanged(['ignitux-backend-1']);
    await sessions.onActiveContainersChanged([]);

    const [second, first] = sessions.listSessions(2, 0);
    expect(first!.hourlyRateEur).toBe(0.5);
    expect(second!.hourlyRateEur).toBe(2);
  });
});
