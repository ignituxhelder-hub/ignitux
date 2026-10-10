import { describe, expect, it } from 'vitest';
import { listeEnTexte, texteEnListe } from './edition';

describe('édition d’une section en texte, une ligne par élément', () => {
  it('relit les risques « risque | gravité | réduction »', () => {
    expect(texteEnListe('risques', 'Loyer élevé | moyenne | Négocier\n\n  Concurrence | forte | Se distinguer  ')).toEqual({
      valeur: [
        { risque: 'Loyer élevé', gravite: 'moyenne', reduction: 'Négocier' },
        { risque: 'Concurrence', gravite: 'forte', reduction: 'Se distinguer' },
      ],
    });
  });

  it('refuse une gravité inconnue en nommant la ligne', () => {
    const r = texteEnListe('risques', 'Loyer | énorme | Négocier');
    expect(r).toEqual({ erreur: expect.stringContaining('ligne 1') });
  });

  it('relit les pièces « pièce | prête ou manquante »', () => {
    expect(texteEnListe('dossier', 'Plan de financement | prête\nBilan | manquante')).toEqual({
      valeur: [
        { piece: 'Plan de financement', etat: 'prete' },
        { piece: 'Bilan', etat: 'manquante' },
      ],
    });
  });

  it('relit les pistes « type | pourquoi » et les étapes une par ligne', () => {
    expect(texteEnListe('pistes', 'Prêt bancaire | Matériel finançable')).toEqual({
      valeur: [{ type: 'Prêt bancaire', pourquoi: 'Matériel finançable' }],
    });
    expect(texteEnListe('prochainesEtapes', 'Faire un prévisionnel\nVoir la banque')).toEqual({
      valeur: ['Faire un prévisionnel', 'Voir la banque'],
    });
  });

  it('fait l’aller-retour sans perte', () => {
    const risques = [{ risque: 'Loyer', gravite: 'faible' as const, reduction: 'Négocier' }];
    expect(texteEnListe('risques', listeEnTexte('risques', risques))).toEqual({ valeur: risques });
    const dossier = [{ piece: 'Bilan', etat: 'manquante' as const }];
    expect(texteEnListe('dossier', listeEnTexte('dossier', dossier))).toEqual({ valeur: dossier });
  });
});
