import 'dotenv/config';

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 4100),
  hourlyRateEur: num(process.env.HOURLY_RATE_EUR, 0.1),
  containerNameFilter: process.env.CONTAINER_NAME_FILTER?.trim() || 'ignitux',
  pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 5000),
  estimatedWattage: num(process.env.ESTIMATED_WATTAGE, 150),
  electricityPricePerKwh: num(process.env.ELECTRICITY_PRICE_PER_KWH, 0.2516),
  databasePath: process.env.DATABASE_PATH?.trim() || './data/usage.db',
} as const;
