import { formatDuration, formatEur, formatPercent } from '../format';
import type { DashboardStats } from '../types';
import StatCard from './StatCard';

interface DashboardProps {
  stats: DashboardStats;
}

export default function Dashboard({ stats }: DashboardProps): JSX.Element {
  const { time, amount, resources, power, currentSession } = stats;

  return (
    <section>
      <p className={`status status--${currentSession ? 'active' : 'idle'}`}>
        {currentSession
          ? `En cours depuis le ${new Date(currentSession.startTime).toLocaleString('fr-FR')} — ${currentSession.serviceName}`
          : 'Aucun conteneur IGNITUX actif actuellement'}
      </p>

      <div className="stat-grid">
        <StatCard label="Temps aujourd'hui" value={formatDuration(time.todaySeconds)} />
        <StatCard label="Temps cette semaine" value={formatDuration(time.weekSeconds)} />
        <StatCard label="Temps ce mois" value={formatDuration(time.monthSeconds)} />
        <StatCard label="Temps total" value={formatDuration(time.totalSeconds)} />

        <StatCard label="Montant dû aujourd'hui" value={formatEur(amount.todayEur)} />
        <StatCard label="Montant dû ce mois" value={formatEur(amount.monthEur)} />
        <StatCard label="Montant dû total" value={formatEur(amount.totalEur)} />

        <StatCard label="CPU moyen" value={formatPercent(resources.avgCpuPercent)} />
        <StatCard
          label="RAM moyenne"
          value={resources.avgRamMb === null ? 'N/D' : `${(resources.avgRamMb / 1024).toFixed(2)} Go`}
        />
        <StatCard label="GPU moyen" value={formatPercent(resources.avgGpuPercent)} />

        <StatCard
          label="Consommation électrique estimée"
          value={`${power.estimatedKwhTotal.toFixed(2)} kWh`}
          hint={formatEur(power.estimatedCostEurTotal)}
        />
      </div>
    </section>
  );
}
