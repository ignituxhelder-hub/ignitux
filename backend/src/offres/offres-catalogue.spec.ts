import {
  CATALOGUE,
  estOffre,
  GENERATEURS,
  normaliserOffre,
  offre,
  OFFRE_PAR_DEFAUT,
  offreSuivante,
  prixCentimes,
  OFFRES,
} from './offres-catalogue.js';
import { MICRO_EUR_PER_EUR } from '../igini/usage/ai-pricing.js';
import { DEFAULT_COST_MICRO_EUR_PER_MONTH } from '../igini/usage/ai-quota.js';

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

      expect(offre('entrepreneur').capacites.generateurs).toEqual([...GENERATEURS]);
      expect(offre('entrepreneur').capacites.generateurs).toHaveLength(6);
    });

    it('n’annonce jamais « executer » parmi les générateurs d’une offre', () => {
      expect(GENERATEURS).toEqual([
        'analyser',
        'former',
        'construire',
        'financer',
        'developper',
        'transmettre',
      ]);
      for (const o of CATALOGUE) {
        expect(o.capacites.generateurs, o.id).not.toContain('executer');
      }
    });

    it('met tout dans l’unique offre payante : outils de gestion, investisseurs, collaborateurs', () => {
      expect(offre('decouverte').capacites.outilsDeGestion).toBe(false);
      expect(offre('entrepreneur').capacites.outilsDeGestion).toBe(true);
      expect(offre('entrepreneur').capacites.investisseurs).toBe(true);
      expect(offre('entrepreneur').capacites.collaborateurs).toBeNull();
    });

    it('n’a qu’une offre payante, à 20 € par mois, et garde Découverte gratuite', () => {
      expect(CATALOGUE.map((o) => o.id)).toEqual(['decouverte', 'entrepreneur']);
      expect(offre('decouverte').prixCentimes).toBe(0);
      expect(offre('entrepreneur').prixCentimes).toBe(2000);
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

    /**
     * UNE OFFRE NE PROMET PAS PLUS QUE LE PLAFOND NE PERMET.
     *
     * Le catalogue a vendu 150 analyses pendant des semaines, tandis que le
     * plafond de coût par utilisateur — 2 €/mois — coupait vers la 39ᵉ. Le
     * produit ne mentait pas à l'usage : il nomme le plafond qui mord. Mais il
     * vendait un chiffre qu'il ne pouvait pas tenir, et la personne qui
     * l'apprenait était celle qui venait de payer.
     *
     * Ce test attache les deux nombres l'un à l'autre. Relever un quota sans
     * relever le plafond le fait échouer, et inversement — c'est le seul
     * moyen de ne pas redécouvrir la contradiction chez un client.
     *
     * 0,0511 € est le coût moyen mesuré sur 55 appels réels (26/09/2026). Il
     * ne couvre pas le pire cas : l'appel le plus cher observé, `construire`
     * à 0,0914 €, coupe plus tôt. C'est assumé et écrit dans le catalogue —
     * viser le pire cas descendrait les offres payantes à 21 analyses, sous
     * ce que l'offre précédente promet déjà.
     */
    it('ne promet jamais plus d’analyses que le plafond de coût n’en permet', () => {
      const COUT_MOYEN_MESURE_EUR = 0.0511;
      const plafondEuros = DEFAULT_COST_MICRO_EUR_PER_MONTH / MICRO_EUR_PER_EUR;
      const permises = Math.floor(plafondEuros / COUT_MOYEN_MESURE_EUR);

      for (const o of CATALOGUE) {
        const promises = o.capacites.appelsIaParMois;
        if (promises === null) continue;
        expect(
          promises,
          `${o.id} promet ${promises} analyses ; le plafond de ${plafondEuros} € n'en ` +
            `permet que ${permises} au coût moyen mesuré`,
        ).toBeLessThanOrEqual(permises);
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
      expect(offreSuivante('entrepreneur')).toBeNull();
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

    // L'offre Construction a été fusionnée dans Entrepreneur : des lignes en
    // base portent encore l'ancien nom, et elles ne doivent pas retomber sur
    // le gratuit.
    it('reconnaît l’ancienne offre « construction » comme Entrepreneur', () => {
      expect(estOffre('construction')).toBe(false);
      expect(normaliserOffre('construction')).toBe('entrepreneur');
      expect(normaliserOffre('entrepreneur')).toBe('entrepreneur');
      expect(normaliserOffre('premium')).toBeNull();
    });
  });

  describe('l’évaluation de financement', () => {
    // Elle se vendait 99 € à part. Elle est comprise dans l'offre payante
    // depuis le 10 octobre 2026, et ne doit plus revenir comme un achat séparé.
    it('est comprise dans l’offre payante, pas dans la gratuite', () => {
      expect(offre('decouverte').capacites.evaluationFinancement).toBe(false);
      expect(offre('entrepreneur').capacites.evaluationFinancement).toBe(true);
    });

    it('n’est pas une offre du catalogue', () => {
      expect(OFFRES as readonly string[]).not.toContain('financement');
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
      expect(prixCentimes('entrepreneur')).toBe(2000);
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
      for (const mauvais of ['vingt euros', '20,00', '-100', '', '9.5']) {
        process.env[CLE] = mauvais;
        expect(prixCentimes('entrepreneur'), mauvais).toBe(2000);
      }
    });
  });

  describe('générateur former', () => {
    it("inclut 'former' dans les offres payantes, pas dans Découverte", () => {
      const decouverte = CATALOGUE.find((o) => o.id === 'decouverte')!;
      const entrepreneur = CATALOGUE.find((o) => o.id === 'entrepreneur')!;

      expect(decouverte.capacites.generateurs).not.toContain('former');
      expect(entrepreneur.capacites.generateurs).toContain('former');
    });
  });
});
