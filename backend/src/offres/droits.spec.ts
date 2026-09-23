import { peut, type Action } from './droits.js';
import { CATALOGUE, GENERATEURS, OFFRES, type OffreId } from './offres-catalogue.js';

describe('droits ouverts par une offre', () => {
  describe('créer un projet', () => {
    it('laisse ouvrir son premier projet en Découverte', () => {
      expect(peut('decouverte', { kind: 'creer_projet', projetsActuels: 0 }).autorise).toBe(true);
    });

    it('refuse le second, et nomme l’offre qui l’ouvre', () => {
      const verdict = peut('decouverte', { kind: 'creer_projet', projetsActuels: 1 });

      expect(verdict.autorise).toBe(false);
      expect(verdict.offreQuiOuvre).toBe('entrepreneur');
      // La phrase doit rester complète lue seule, sans son contexte.
      expect(verdict.raison).toContain('Entrepreneur');
    });

    it('ne compte plus les projets au-dessus', () => {
      expect(peut('entrepreneur', { kind: 'creer_projet', projetsActuels: 40 }).autorise).toBe(
        true,
      );
    });
  });

  describe('générer', () => {
    it('laisse analyser en Découverte, c’est le point de départ', () => {
      expect(
        peut('decouverte', { kind: 'generer', generateur: 'analyser', appelsCeMois: 0 }).autorise,
      ).toBe(true);
    });

    it('refuse les quatre autres générateurs en Découverte', () => {
      for (const g of GENERATEURS.filter((x) => x !== 'analyser')) {
        const verdict = peut('decouverte', { kind: 'generer', generateur: g, appelsCeMois: 0 });
        expect(verdict.autorise, g).toBe(false);
        expect(verdict.offreQuiOuvre, g).toBe('entrepreneur');
      }
    });

    // Deux refus qui n'ont rien à voir : « pas dans ton offre » se règle en
    // changeant d'offre, « épuisé ce mois-ci » se règle aussi en attendant.
    it('distingue « pas inclus » de « épuisé ce mois-ci »', () => {
      const pasInclus = peut('decouverte', {
        kind: 'generer',
        generateur: 'financer',
        appelsCeMois: 0,
      });
      const epuise = peut('decouverte', {
        kind: 'generer',
        generateur: 'analyser',
        appelsCeMois: 3,
      });

      expect(pasInclus.seRenouvelleLeMoisProchain).toBe(false);
      expect(epuise.seRenouvelleLeMoisProchain).toBe(true);
      expect(epuise.raison).toMatch(/mois prochain/);
    });

    // Sur la dernière offre il n'y a rien à vendre : seulement à attendre.
    // Proposer une montée serait une vente forcée vers le vide.
    it('ne propose aucune offre quand on est déjà sur la dernière', () => {
      const derniere = CATALOGUE[CATALOGUE.length - 1];
      const quota = derniere.capacites.appelsIaParMois as number;

      const verdict = peut(derniere.id, {
        kind: 'generer',
        generateur: 'analyser',
        appelsCeMois: quota,
      });

      expect(verdict.autorise).toBe(false);
      expect(verdict.offreQuiOuvre).toBeNull();
      expect(verdict.seRenouvelleLeMoisProchain).toBe(true);
      expect(verdict.raison).not.toMatch(/L’offre/);
    });

    it('laisse passer tant que le quota n’est pas atteint', () => {
      expect(
        peut('entrepreneur', { kind: 'generer', generateur: 'construire', appelsCeMois: 29 })
          .autorise,
      ).toBe(true);
      expect(
        peut('entrepreneur', { kind: 'generer', generateur: 'construire', appelsCeMois: 30 })
          .autorise,
      ).toBe(false);
    });
  });

  describe('les outils de gestion', () => {
    it('sont fermés en dessous de Construction, et nomment Construction', () => {
      for (const id of ['decouverte', 'entrepreneur'] as const) {
        const verdict = peut(id, { kind: 'outil_de_gestion', outil: 'comptabilite' });
        expect(verdict.autorise, id).toBe(false);
        expect(verdict.offreQuiOuvre, id).toBe('construction');
      }
    });

    it('sont ouverts en Construction', () => {
      expect(peut('construction', { kind: 'outil_de_gestion', outil: 'banque' }).autorise).toBe(
        true,
      );
    });
  });

  describe('le financement et les collaborateurs', () => {
    it('ferme le financement sous Construction', () => {
      expect(peut('entrepreneur', { kind: 'ouvrir_financement' }).offreQuiOuvre).toBe(
        'construction',
      );
    });

    it('dit clairement qu’aucun collaborateur n’est possible, sans parler de plafond atteint', () => {
      const verdict = peut('decouverte', {
        kind: 'inviter_collaborateur',
        collaborateursActuels: 0,
      });

      expect(verdict.autorise).toBe(false);
      expect(verdict.raison).toMatch(/ne permet pas d’inviter/);
      expect(verdict.raison).not.toMatch(/déjà là/);
    });

    it('n’impose aucun plafond en Construction', () => {
      expect(
        peut('construction', { kind: 'inviter_collaborateur', collaborateursActuels: 12 })
          .autorise,
      ).toBe(true);
    });
  });

  describe('règles qui valent pour tous les refus', () => {
    const REFUS: Array<[OffreId, Action]> = [
      ['decouverte', { kind: 'creer_projet', projetsActuels: 1 }],
      ['decouverte', { kind: 'generer', generateur: 'financer', appelsCeMois: 0 }],
      ['decouverte', { kind: 'generer', generateur: 'analyser', appelsCeMois: 99 }],
      ['entrepreneur', { kind: 'outil_de_gestion', outil: 'facturation' }],
      ['entrepreneur', { kind: 'ouvrir_financement' }],
      ['entrepreneur', { kind: 'inviter_collaborateur', collaborateursActuels: 0 }],
    ];

    // Un refus sans phrase est une impasse : la personne voit un bouton
    // mort et ne sait pas si c'est une panne ou une limite.
    it('donne toujours une raison lisible', () => {
      for (const [offreId, action] of REFUS) {
        const verdict = peut(offreId, action);
        expect(verdict.autorise, `${offreId}/${action.kind}`).toBe(false);
        expect((verdict.raison ?? '').length, `${offreId}/${action.kind}`).toBeGreaterThan(20);
      }
    });

    // Soit une offre lève la limite, soit elle se renouvelle. Un refus qui
    // n'offre ni l'un ni l'autre ne laisse aucune suite.
    it('offre toujours une suite : une offre, ou une échéance', () => {
      for (const [offreId, action] of REFUS) {
        const verdict = peut(offreId, action);
        expect(
          verdict.offreQuiOuvre !== null || verdict.seRenouvelleLeMoisProchain,
          `${offreId}/${action.kind}`,
        ).toBe(true);
      }
    });
  });

  // Une ligne de base abîmée ne doit ni ouvrir des droits, ni tout fermer.
  it('traite une offre inconnue comme la gratuite', () => {
    const verdict = peut('inventee' as never, { kind: 'creer_projet', projetsActuels: 0 });

    expect(verdict.autorise).toBe(true);
    expect(peut('inventee' as never, { kind: 'outil_de_gestion', outil: 'banque' }).autorise).toBe(
      false,
    );
  });

  it('couvre toutes les offres déclarées', () => {
    for (const id of OFFRES) {
      expect(() => peut(id, { kind: 'creer_projet', projetsActuels: 0 })).not.toThrow();
    }
  });
});
