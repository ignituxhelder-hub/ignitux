import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/database';
import { SessionService } from '../src/services/sessionService';
import { SettingsService } from '../src/services/settingsService';
import { StatsService, startOfDay, startOfMonth, startOfWeek } from '../src/services/statsService';

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('startOfDay', () => {
  it('ramène la date à minuit, le même jour', () => {
    const date = new Date(2026, 8, 26, 15, 42, 10);
    const result = startOfDay(date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(26);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe('startOfWeek', () => {
  it('renvoie toujours le lundi précédent (ou le jour même), à minuit', () => {
    // Balaie tout un mois pour ne dépendre d'aucune date calendaire précise.
    for (let day = 1; day <= 28; day += 1) {
      const date = new Date(2026, 8, day, 12, 0, 0);
      const monday = startOfWeek(date);
      expect(monday.getDay()).toBe(1);
      expect(monday.getHours()).toBe(0);
      expect(monday.getTime()).toBeLessThanOrEqual(date.getTime());
      expect(date.getTime() - monday.getTime()).toBeLessThan(7 * 24 * 3600 * 1000);
    }
  });
});

describe('startOfMonth', () => {
  it('renvoie le 1er du mois à minuit', () => {
    const date = new Date(2026, 8, 26, 15, 42, 10);
    const result = startOfMonth(date);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
  });
});

describe('StatsService.getDashboard', () => {
  it("borne la durée de chaque session à la période, et cumule le montant au tarif propre à chaque session", () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    const sessionService = new SessionService(db, settings);
    const stats = new StatsService(db, sessionService, settings);

    const now = new Date(2026, 8, 26, 18, 0, 0);

    // Session close, entièrement la veille, 1h à 0,10 €/h.
    db.prepare(
      `INSERT INTO sessions (service_name, container_names, start_time, end_time, duration_seconds, hourly_rate_eur, amount_due_eur)
       VALUES ('ignitux-backend-1', '["ignitux-backend-1"]', ?, ?, 3600, 0.10, 0.10)`,
    ).run(
      new Date(2026, 8, 25, 10, 0, 0).toISOString(),
      new Date(2026, 8, 25, 11, 0, 0).toISOString(),
    );

    // Session en cours, commencée ce matin à 8h, tarif 0,20 €/h.
    db.prepare(
      `INSERT INTO sessions (service_name, container_names, start_time, hourly_rate_eur)
       VALUES ('ignitux-backend-1', '["ignitux-backend-1"]', ?, 0.20)`,
    ).run(new Date(2026, 8, 26, 8, 0, 0).toISOString());

    const dashboard = stats.getDashboard(now);

    // Aujourd'hui : seulement la session en cours, 10h (8h -> 18h).
    expect(dashboard.time.todaySeconds).toBeCloseTo(10 * 3600, 0);
    expect(dashboard.amount.todayEur).toBeCloseTo(10 * 0.2, 5);

    // Total : 1h d'hier + 10h aujourd'hui.
    expect(dashboard.time.totalSeconds).toBeCloseTo(11 * 3600, 0);
    expect(dashboard.amount.totalEur).toBeCloseTo(1 * 0.1 + 10 * 0.2, 5);

    expect(dashboard.currentSession).not.toBeNull();
    expect(dashboard.currentSession?.endTime).toBeNull();
  });

  it('estime la consommation électrique à partir du temps total et du réglage de puissance', () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    settings.updateSettings({ estimatedWattage: 200, electricityPricePerKwh: 0.25 });
    const sessionService = new SessionService(db, settings);
    const stats = new StatsService(db, sessionService, settings);

    db.prepare(
      `INSERT INTO sessions (service_name, container_names, start_time, end_time, duration_seconds, hourly_rate_eur, amount_due_eur)
       VALUES ('ignitux-backend-1', '["ignitux-backend-1"]', ?, ?, 36000, 0.10, 1.0)`,
    ).run(
      new Date(2026, 8, 25, 0, 0, 0).toISOString(),
      new Date(2026, 8, 25, 10, 0, 0).toISOString(),
    );

    const dashboard = stats.getDashboard(new Date(2026, 8, 26, 0, 0, 0));

    // 10h à 200 W = 2 kWh, à 0,25 €/kWh = 0,50 €.
    expect(dashboard.power.estimatedKwhTotal).toBeCloseTo(2, 5);
    expect(dashboard.power.estimatedCostEurTotal).toBeCloseTo(0.5, 5);
  });
});
