import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../src/api';
import App from '../src/App';
import type { DashboardStats } from '../src/types';

const baseDashboard: DashboardStats = {
  time: { todaySeconds: 3600, weekSeconds: 3600, monthSeconds: 3600, totalSeconds: 3600 },
  amount: { todayEur: 0.1, monthEur: 0.1, totalEur: 0.1 },
  resources: { avgCpuPercent: 12.3, avgRamMb: 2048, avgGpuPercent: null },
  power: { estimatedKwhTotal: 0.15, estimatedCostEurTotal: 0.04 },
  currentSession: null,
};

describe('App', () => {
  it('affiche le tableau de bord une fois les données chargées', async () => {
    vi.spyOn(api, 'fetchDashboard').mockResolvedValue(baseDashboard);
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([]);

    render(<App />);

    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Temps aujourd'hui")).toBeInTheDocument());
    expect(screen.getByText('Aucun conteneur IGNITUX actif actuellement')).toBeInTheDocument();
    expect(screen.getByText('Aucune session enregistrée pour le moment.')).toBeInTheDocument();
  });

  it("affiche une erreur si l'API ne répond pas", async () => {
    vi.spyOn(api, 'fetchDashboard').mockRejectedValue(new Error('offline'));
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([]);

    render(<App />);

    await waitFor(() => expect(screen.getByText(/offline/)).toBeInTheDocument());
  });
});
