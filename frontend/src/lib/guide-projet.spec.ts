import { describe, expect, it } from 'vitest';
import { destinationDe } from './guide-projet';

describe('où mène « Y aller »', () => {
  it('ouvre l’analyse et vise son bouton', () => {
    expect(destinationDe('analyser')).toEqual({
      ouvre: 'analyse',
      avancee: false,
      cible: '[data-guide-cible="analyse"]',
    });
  });

  it('mène au champ description pour décrire ou reprendre l’idée', () => {
    expect(destinationDe('decrire')).toEqual({ ouvre: 'infos', avancee: false, cible: '#description' });
    expect(destinationDe('ameliorer')).toEqual(destinationDe('decrire'));
  });

  it('passe en vue avancée pour les tâches et les démarches', () => {
    expect(destinationDe('premieres-taches')).toEqual({ ouvre: 'taches', avancee: true, cible: '#taches' });
    expect(destinationDe('avancer-taches')).toEqual(destinationDe('premieres-taches'));
    expect(destinationDe('conformite')).toEqual({
      ouvre: 'conformite',
      avancee: true,
      cible: '[data-guide-cible="conformite"]',
    });
  });

  it('vise le bouton de génération des plans', () => {
    expect(destinationDe('construire')?.cible).toBe('[data-guide-cible="construction"]');
    expect(destinationDe('developper')?.ouvre).toBe('developpement');
    expect(destinationDe('transmettre')?.ouvre).toBe('transmission');
  });

  it('ne devine rien pour une étape inconnue', () => {
    expect(destinationDe('zzz')).toBeNull();
  });
});
