import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../src/db/database';
import { SettingsService } from '../src/services/settingsService';

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('SettingsService', () => {
  it('amorce les valeurs par défaut au premier accès', () => {
    const settings = new SettingsService(createTestDb());
    const values = settings.getSettings();
    expect(values.hourlyRateEur).toBeCloseTo(0.1);
    expect(values.containerNameFilter).toBe('ignitux');
    expect(values.estimatedWattage).toBeGreaterThan(0);
    expect(values.electricityPricePerKwh).toBeGreaterThan(0);
  });

  it('persiste les mises à jour partielles sans toucher aux autres réglages', () => {
    const settings = new SettingsService(createTestDb());
    settings.updateSettings({ hourlyRateEur: 0.25 });

    const values = settings.getSettings();
    expect(values.hourlyRateEur).toBe(0.25);
    expect(values.containerNameFilter).toBe('ignitux');
  });

  it('ignore les champs non fournis dans une mise à jour partielle', () => {
    const settings = new SettingsService(createTestDb());
    settings.updateSettings({ containerNameFilter: 'mon-projet' });

    expect(settings.getSettings().containerNameFilter).toBe('mon-projet');
  });
});
