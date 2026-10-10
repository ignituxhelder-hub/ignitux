import { describe, expect, it } from 'vitest';
import { formatDuration, formatEur, formatPercent } from '../src/format';

describe('formatDuration', () => {
  it('formate des secondes en heures et minutes', () => {
    expect(formatDuration(3661)).toBe('1 h 01 min');
    expect(formatDuration(59)).toBe('0 h 00 min');
    expect(formatDuration(7200)).toBe('2 h 00 min');
  });
});

describe('formatEur', () => {
  it('formate un montant en euros', () => {
    expect(formatEur(1.5)).toContain('1,50');
    expect(formatEur(0)).toContain('0,00');
  });
});

describe('formatPercent', () => {
  it("affiche N/D quand la valeur n'est pas disponible", () => {
    expect(formatPercent(null)).toBe('N/D');
  });

  it('formate un pourcentage avec une décimale', () => {
    expect(formatPercent(42.36)).toBe('42.4 %');
  });
});
