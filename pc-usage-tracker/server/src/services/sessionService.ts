import type { Db } from '../db/database';
import type { ResourceSample, SessionRecord } from '../types';
import { sampleResources } from './resourceMonitor';
import type { SettingsService } from './settingsService';

interface SessionRow {
  id: number;
  service_name: string;
  container_names: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  hourly_rate_eur: number;
  amount_due_eur: number | null;
  avg_cpu_percent: number | null;
  avg_ram_mb: number | null;
  avg_gpu_percent: number | null;
}

function rowToRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    serviceName: row.service_name,
    containerNames: JSON.parse(row.container_names) as string[],
    startTime: row.start_time,
    endTime: row.end_time,
    durationSeconds: row.duration_seconds,
    hourlyRateEur: row.hourly_rate_eur,
    amountDueEur: row.amount_due_eur,
    avgCpuPercent: row.avg_cpu_percent,
    avgRamMb: row.avg_ram_mb,
    avgGpuPercent: row.avg_gpu_percent,
  };
}

/**
 * Machine à états entre les sondages Docker et l'historique en base :
 * aucun conteneur IGNITUX actif → session ouverte : on la crée ; des
 * conteneurs actifs → session déjà ouverte : on fusionne les noms et on
 * relève un échantillon de ressources ; plus aucun conteneur actif → session
 * ouverte : on la ferme et on calcule le montant dû.
 */
export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  getCurrentSession(): SessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE end_time IS NULL ORDER BY id DESC LIMIT 1')
      .get() as unknown as SessionRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  listSessions(limit: number, offset: number): SessionRecord[] {
    // Départage à l'id : deux sessions peuvent partager le même horodatage
    // à la milliseconde (ouverture/fermeture rapprochées), et l'ordre
    // d'insertion doit rester l'ordre affiché.
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY start_time DESC, id DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as unknown as SessionRow[];
    return rows.map(rowToRecord);
  }

  listAllSessions(): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY start_time ASC, id ASC')
      .all() as unknown as SessionRow[];
    return rows.map(rowToRecord);
  }

  /** Point d'entrée appelé à chaque sondage avec les conteneurs IGNITUX actuellement actifs. */
  async onActiveContainersChanged(activeNames: string[]): Promise<void> {
    const current = this.getCurrentSession();

    if (activeNames.length === 0) {
      if (current) this.closeSession(current);
      return;
    }

    if (!current) {
      this.openSession(activeNames);
      return;
    }

    this.mergeContainerNames(current, activeNames);
    await this.recordResourceSample(current.id);
  }

  private openSession(activeNames: string[]): void {
    const now = new Date().toISOString();
    const { hourlyRateEur } = this.settings.getSettings();
    this.db
      .prepare(
        `INSERT INTO sessions (service_name, container_names, start_time, hourly_rate_eur)
         VALUES (?, ?, ?, ?)`,
      )
      .run(activeNames.join(', '), JSON.stringify(activeNames), now, hourlyRateEur);
  }

  private mergeContainerNames(current: SessionRecord, activeNames: string[]): void {
    const merged = Array.from(new Set([...current.containerNames, ...activeNames]));
    if (merged.length === current.containerNames.length) return;
    this.db
      .prepare('UPDATE sessions SET container_names = ?, service_name = ? WHERE id = ?')
      .run(JSON.stringify(merged), merged.join(', '), current.id);
  }

  private async recordResourceSample(sessionId: number): Promise<void> {
    let sample: ResourceSample;
    try {
      sample = await sampleResources();
    } catch {
      return;
    }
    this.db
      .prepare(
        `INSERT INTO resource_samples (session_id, timestamp, cpu_percent, ram_used_mb, gpu_percent)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, new Date().toISOString(), sample.cpuPercent, sample.ramUsedMb, sample.gpuPercent);
  }

  private closeSession(current: SessionRecord): void {
    const endTime = new Date();
    const startTime = new Date(current.startTime);
    const durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    const amountDueEur = (durationSeconds / 3600) * current.hourlyRateEur;

    const averages = this.db
      .prepare(
        `SELECT AVG(cpu_percent) AS avgCpu, AVG(ram_used_mb) AS avgRam, AVG(gpu_percent) AS avgGpu
         FROM resource_samples WHERE session_id = ?`,
      )
      .get(current.id) as unknown as {
      avgCpu: number | null;
      avgRam: number | null;
      avgGpu: number | null;
    };

    this.db
      .prepare(
        `UPDATE sessions
         SET end_time = ?, duration_seconds = ?, amount_due_eur = ?,
             avg_cpu_percent = ?, avg_ram_mb = ?, avg_gpu_percent = ?
         WHERE id = ?`,
      )
      .run(
        endTime.toISOString(),
        durationSeconds,
        amountDueEur,
        averages.avgCpu,
        averages.avgRam,
        averages.avgGpu,
        current.id,
      );
  }
}
