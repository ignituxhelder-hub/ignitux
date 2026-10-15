import { describe, expect, it } from 'vitest';
import { LONGUEUR_TITRE, titreCourt } from './titre-court';

describe('titreCourt', () => {
  it('laisse intact un titre déjà court', () => {
    expect(titreCourt('Nettoyage = valeur économique démontrée ?')).toBe('Nettoyage = valeur économique démontrée ?');
  });

  it('garde la première phrase d’un paragraphe', () => {
    const texte =
      'Faites le test d’assurabilité cette semaine, avant tout le reste. Appelez 4 à 5 assureurs spécialisés bâtiment en décrivant précisément l’activité et demandez un devis écrit.';
    expect(titreCourt(texte)).toBe('Faites le test d’assurabilité cette semaine, avant tout le reste.');
  });

  it('coupe à la première articulation et le signale par « … »', () => {
    const texte =
      'Prêt d’honneur Initiative Haute-Savoie ou Réseau Entreprendre — double intérêt : il compte comme quasi-apport et débloque l’effet de levier bancaire, souvent deux à trois fois.';
    expect(titreCourt(texte)).toBe('Prêt d’honneur Initiative Haute-Savoie ou Réseau Entreprendre…');
  });

  it('ne coupe pas sur une articulation trop proche du début', () => {
    const texte =
      'Mois 1 à 2 — Qualifier la demande par des appels réels, pas par une étude : constituer une liste de 60 contacts et les appeler avec quatre questions.';
    expect(titreCourt(texte)).toBe('Mois 1 à 2 — Qualifier la demande par des appels réels, pas par une étude…');
  });

  it('sans articulation, coupe au dernier mot entier avant la limite', () => {
    const texte = `${'mot '.repeat(60)}fin`;
    const court = titreCourt(texte);
    expect(court.length).toBeLessThanOrEqual(LONGUEUR_TITRE + 1);
    expect(court.endsWith('mot…')).toBe(true);
  });
});
