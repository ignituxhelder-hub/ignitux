import type { Db } from '../db/database';
import { config } from '../config';
import type { Settings } from '../types';

const DEFAULTS: Record<keyof Settings, string> = {
  hourlyRateEur: String(config.hourlyRateEur),
  containerNameFilter: config.containerNameFilter,
  estimatedWattage: String(config.estimatedWattage),
  electricityPricePerKwh: String(config.electricityPricePerKwh),
};

/**
 * Les réglages vivent en base (table `settings`, clé/valeur) pour pouvoir
 * être changés depuis le tableau de bord sans redémarrer le service. Les
 * variables d'environnement ne servent qu'à amorcer les valeurs par défaut
 * au tout premier démarrage.
 */
export class SettingsService {
  constructor(private readonly db: Db) {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const insert = this.db.prepare(
      'INSERT INTO settings (key, value) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)',
    );
    for (const [key, value] of Object.entries(DEFAULTS)) {
      insert.run(key, value, key);
    }
  }

  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{
      key: string;
      value: string;
    }>;
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
      hourlyRateEur: Number(map.get('hourlyRateEur') ?? DEFAULTS.hourlyRateEur),
      containerNameFilter: map.get('containerNameFilter') ?? DEFAULTS.containerNameFilter,
      estimatedWattage: Number(map.get('estimatedWattage') ?? DEFAULTS.estimatedWattage),
      electricityPricePerKwh: Number(
        map.get('electricityPricePerKwh') ?? DEFAULTS.electricityPricePerKwh,
      ),
    };
  }

  updateSettings(partial: Partial<Settings>): Settings {
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined) continue;
      upsert.run(key, String(value));
    }
    return this.getSettings();
  }
}
