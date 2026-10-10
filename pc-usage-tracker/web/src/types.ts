export interface SessionRecord {
  id: number;
  serviceName: string;
  containerNames: string[];
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  hourlyRateEur: number;
  amountDueEur: number | null;
  avgCpuPercent: number | null;
  avgRamMb: number | null;
  avgGpuPercent: number | null;
}

export interface DashboardStats {
  time: {
    todaySeconds: number;
    weekSeconds: number;
    monthSeconds: number;
    totalSeconds: number;
  };
  amount: {
    todayEur: number;
    monthEur: number;
    totalEur: number;
  };
  resources: {
    avgCpuPercent: number | null;
    avgRamMb: number | null;
    avgGpuPercent: number | null;
  };
  power: {
    estimatedKwhTotal: number;
    estimatedCostEurTotal: number;
  };
  currentSession: SessionRecord | null;
}
