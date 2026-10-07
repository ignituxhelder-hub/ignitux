import { describe, expect, it } from 'vitest';
import { pointsDeBaseDepuisPourcentage, pourcentage } from './montants';

describe('pointsDeBaseDepuisPourcentage', () => {
  it('convertit un pourcentage entier', () => {
    expect(pointsDeBaseDepuisPourcentage('60')).toBe(6000);
    expect(pointsDeBaseDepuisPourcentage('0')).toBe(0);
    expect(pointsDeBaseDepuisPourcentage('100')).toBe(10000);
  });

  it('accepte la virgule ou le point décimal', () => {
    expect(pointsDeBaseDepuisPourcentage('12,5')).toBe(1250);
    expect(pointsDeBaseDepuisPourcentage('2.5')).toBe(250);
  });

  it('ignore les espaces et le signe %', () => {
    expect(pointsDeBaseDepuisPourcentage(' 36 % ')).toBe(3600);
  });

  it('reste entier malgré les flottants (0,29 % donne 29, pas 28)', () => {
    expect(pointsDeBaseDepuisPourcentage('0,29')).toBe(29);
    expect(pointsDeBaseDepuisPourcentage('33,33')).toBe(3333);
  });

  it('renvoie null pour une saisie illisible, vide, négative ou supérieure à 100 %', () => {
    expect(pointsDeBaseDepuisPourcentage('beaucoup')).toBeNull();
    expect(pointsDeBaseDepuisPourcentage('')).toBeNull();
    expect(pointsDeBaseDepuisPourcentage('-5')).toBeNull();
    expect(pointsDeBaseDepuisPourcentage('100,01')).toBeNull();
  });

  it('est l’inverse de pourcentage()', () => {
    for (const bps of [0, 29, 250, 1250, 3600, 5100, 10000]) {
      expect(pointsDeBaseDepuisPourcentage(pourcentage(bps))).toBe(bps);
    }
  });
});
