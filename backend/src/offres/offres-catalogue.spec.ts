import {
  CATALOGUE,
  estOffre,
  EVALUATION_FINANCEMENT,
  GENERATEURS,
  offre,
  OFFRE_PAR_DEFAUT,
  offreSuivante,
  prixCentimes,
  OFFRES,
} from './offres-catalogue.js';

describe('catalogue des offres', () => {
  it('expose une offre par identifiant déclaré, et pas davantage', () => {
    expect(CATALOGUE.map((o) => o.id).sort()).toEqual([...OFFRES].sort());
  });

  it('n’a pas deux offres au même identifiant', () => {
    const ids = CATALOGUE.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('la ligne de partage', () => {
    // Le principe : ce qui n'a pas de coût marginal reste gratuit. Enfermer
    // les tâches, la mémoire ou les scores derrière un péage ferait payer
    // pour de l'électricité qu'on ne consomme pas.
    it('laisse un projet entier et utilisable à l’offre gratuite', () => {
      const gratuite = offre('decouverte');

      expect(gratuite.prixCentimes).toBe(0);
      expect(gratuite.capacites.projets).toBe(1);
    });

    // Une seule analyse rendrait impossible de retravailler son idée et de
    // la relancer — exactement le geste qu'on veut encourager.
    it('offre assez d’analyses pour retravailler une idée, pas une seule', () => {
      expect(offre('decouverte').capacites.appelsIaParMois).toBeGreaterThan(1);
    });

    it('réserve les quatre générateurs suivants aux offres payantes', () => {
      expect(offre('decouverte').capacites.generateurs).toEqual(['analyser']);

      for (const id of ['entrepreneur', 'construction'] as const) {
        expect(offre(id).capacites.generateurs).toEqual([...GENERATEURS]);
      }
    });

    it('réserve les outils de gestion à l’offre Construction', () => {
      expect(offre('decouverte').capacites.outilsDeGestion).toBe(false);
      expect(offre('entrepreneur').capacites.outilsDeGestion).toBe(false);
      expect(offre('construction').capacites.outilsDeGestion).toBe(true);
    });
  });

  describe('la progression', () => {
    // Les prix et les quotas montent ensemble. Une offre plus chère qui
    // donnerait moins serait un défaut invisible à la lecture du fichier.
    it('ne fait jamais baisser le prix en montant dans le catalogue', () => {
      for (let i = 1; i < CATALOGUE.length; i += 1) {
        expect(
          CATALOGUE[i].prixCentimes,
          `${CATALOGUE[i].id} ne doit pas coûter moins que ${CATALOGUE[i - 1].id}`,
        ).toBeGreaterThan(CATALOGUE[i - 1].prixCentimes);
      }
    });

    it('ne fait jamais baisser le quota d’appels en montant', () => {
      for (let i = 1; i < CATALOGUE.length; i += 1) {
        const avant = CATALOGUE[i - 1].capacites.appelsIaParMois;
        const apres = CATALOGUE[i].capacites.appelsIaParMois;
        if (avant === null) continue;
        expect(apres === null || apres > avant, `${CATALOGUE[i].id}`).toBe(true);
      }
    });

    it('ne retire jamais un générateur en montant', () => {
      for (let i = 1; i < CATALOGUE.length; i += 1) {
        for (const g of CATALOGUE[i - 1].capacites.generateurs) {
          expect(CATALOGUE[i].capacites.generateurs, `${CATALOGUE[i].id}`).toContain(g);
        }
      }
    });

    it('propose l’offre au-dessus, et rien au-delà de la dernière', () => {
      expect(offreSuivante('decouverte')?.id).toBe('entrepreneur');
      expect(offreSuivante('entrepreneur')?.id).toBe('construction');
      expect(offreSuivante('construction')).toBeNull();
    });
  });

  describe('les repères pour un humain', () => {
    it('donne un résumé à chaque offre', () => {
      for (const o of CATALOGUE) {
        expect(o.resume.trim().length, o.id).toBeGreaterThan(20);
      }
    });

    // Une offre gratuite qui argumente son propre intérêt sonne comme une
    // vente alors qu'il n'y a rien à vendre.
    it('n’argumente pas la première, et argumente toutes les suivantes', () => {
      expect(CATALOGUE[0].argument).toBeNull();
      for (const o of CATALOGUE.slice(1)) {
        expect(o.argument?.trim().length ?? 0, o.id).toBeGreaterThan(20);
      }
    });
  });

  describe('un identifiant inconnu', () => {
    // Une ligne de base abîmée ne doit ni ouvrir des droits, ni priver
    // quelqu'un de son produit. Le repli sûr est l'offre gratuite.
    it('retombe sur l’offre gratuite plutôt que de lever ou d’ouvrir', () => {
      expect(offre('inconnue' as never).id).toBe(OFFRE_PAR_DEFAUT);
      expect(offre('inconnue' as never).prixCentimes).toBe(0);
    });

    it('se reconnaît', () => {
      expect(estOffre('entrepreneur')).toBe(true);
      expect(estOffre('premium')).toBe(false);
    });
  });

  describe('l’évaluation de financement', () => {
    // La seule chose qui distingue une évaluation payante d'une promesse
    // vendue est cette phrase. Elle doit rester lisible partout où le
    // montant s'affiche.
    it('dit que le paiement n’achète pas un financement', () => {
      expect(EVALUATION_FINANCEMENT.avertissement).toMatch(/pas un financement/);
    });

    it('assume qu’un refus est un résultat, pas un échec du service', () => {
      expect(EVALUATION_FINANCEMENT.avertissement).toMatch(/pas un échec/);
    });

    // Un abonnement laisserait croire qu'on paie pour rester finançable.
    it('n’est pas une offre du catalogue', () => {
      expect(OFFRES as readonly string[]).not.toContain('financement');
      expect(CATALOGUE.some((o) => o.prixCentimes === EVALUATION_FINANCEMENT.prixCentimes)).toBe(
        false,
      );
    });
  });

  describe('le prix, réglable sans redéploiement', () => {
    const CLE = 'OFFRE_ENTREPRENEUR_PRIX_CENTIMES';
    let initial: string | undefined;

    beforeEach(() => {
      initial = process.env[CLE];
      delete process.env[CLE];
    });

    afterEach(() => {
      if (initial === undefined) delete process.env[CLE];
      else process.env[CLE] = initial;
    });

    it('prend la valeur du catalogue par défaut', () => {
      expect(prixCentimes('entrepreneur')).toBe(990);
    });

    it('accepte une surcharge, par exemple un prix de bêta', () => {
      process.env[CLE] = '490';

      expect(prixCentimes('entrepreneur')).toBe(490);
      expect(offre('entrepreneur').prixCentimes).toBe(490);
    });

    it('accepte la gratuité temporaire, qui est une décision légitime', () => {
      process.env[CLE] = '0';

      expect(prixCentimes('entrepreneur')).toBe(0);
    });

    // Une faute de frappe ne doit pas rendre une offre gratuite par
    // accident, ni empêcher la page des offres de s afficher.
    it('ignore une valeur illisible ou négative au lieu de casser le prix', () => {
      for (const mauvais of ['neuf euros', '9,90', '-100', '', '9.5']) {
        process.env[CLE] = mauvais;
        expect(prixCentimes('entrepreneur'), mauvais).toBe(990);
      }
    });
  });
});
