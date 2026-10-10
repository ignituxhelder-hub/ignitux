import type { Db } from '../db/database';
import type { DashboardStats, SessionRecord } from '../types';
import type { SessionService } from './sessionService';
import type { SettingsService } from './settingsService';

interface PeriodBounds {
  start: Date;
  end: Date;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Lundi comme premier jour de la semaine (convention française/européenne). */
export function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  const isoDayIndex = (result.getDay() + 6) % 7; // lundi = 0 ... dimanche = 6
  result.setDate(result.getDate() - isoDayIndex);
  return result;
}

export function startOfMonth(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
}

/**
 * Durée (en secondes) de la portion d'une session qui tombe dans une
 * période donnée. Une session en cours (`endTime` nul) est bornée à `now` :
 * son temps « aujourd'hui » ne cesse jamais de courir avant d'être fermée.
 */
function overlapSeconds(session: SessionRecord, bounds: PeriodBounds, now: Date): number {
  const sessionStart = new Date(session.startTime).getTime();
  const sessionEnd = session.endTime ? new Date(session.endTime).getTime() : now.getTime();
  const overlapStart = Math.max(sessionStart, bounds.start.getTime());
  const overlapEnd = Math.min(sessionEnd, bounds.end.getTime());
  return Math.max(0, (overlapEnd - overlapStart) / 1000);
}

/**
 * Montant dû, pour une période, en utilisant le tarif qui était en vigueur
 * pendant CETTE session (`hourlyRateEur` figé à l'ouverture) — pas le tarif
 * courant. Sans quoi changer le tarif réécrirait le montant dû pour des
 * sessions passées.
 */
function periodAmountEur(session: SessionRecord, bounds: PeriodBounds, now: Date): number {
  return (overlapSeconds(session, bounds, now) / 3600) * session.hourlyRateEur;
}

export class StatsService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
  ) {}

  getDashboard(now: Date = new Date()): DashboardStats {
    const records = this.sessions.listAllSessions();

    const bounds: Record<'today' | 'week' | 'month' | 'total', PeriodBounds> = {
      today: { start: startOfDay(now), end: now },
      week: { start: startOfWeek(now), end: now },
      month: { start: startOfMonth(now), end: now },
      total: { start: new Date(0), end: now },
    };

    const sumSeconds = (period: PeriodBounds): number =>
      records.reduce((total, session) => total + overlapSeconds(session, period, now), 0);
    const sumAmount = (period: PeriodBounds): number =>
      records.reduce((total, session) => total + periodAmountEur(session, period, now), 0);

    const resourceAverages = this.db
      .prepare(
        `SELECT AVG(cpu_percent) AS avgCpu, AVG(ram_used_mb) AS avgRam, AVG(gpu_percent) AS avgGpu
         FROM resource_samples`,
      )
      .get() as unknown as { avgCpu: number | null; avgRam: number | null; avgGpu: number | null };

    const { estimatedWattage, electricityPricePerKwh } = this.settings.getSettings();
    const totalSeconds = sumSeconds(bounds.total);
    const estimatedKwhTotal = (totalSeconds / 3600) * (estimatedWattage / 1000);

    return {
      time: {
        todaySeconds: sumSeconds(bounds.today),
        weekSeconds: sumSeconds(bounds.week),
        monthSeconds: sumSeconds(bounds.month),
        totalSeconds,
      },
      amount: {
        todayEur: sumAmount(bounds.today),
        monthEur: sumAmount(bounds.month),
        totalEur: sumAmount(bounds.total),
      },
      resources: {
        avgCpuPercent: resourceAverages.avgCpu,
        avgRamMb: resourceAverages.avgRam,
        avgGpuPercent: resourceAverages.avgGpu,
      },
      power: {
        estimatedKwhTotal,
        estimatedCostEurTotal: estimatedKwhTotal * electricityPricePerKwh,
      },
      currentSession: this.sessions.getCurrentSession(),
    };
  }
}
