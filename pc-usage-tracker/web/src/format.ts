export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatPercent(value: number | null): string {
  return value === null ? 'N/D' : `${value.toFixed(1)} %`;
}
