import { lanceur, MAX_SUGGESTIONS, type ContexteActivation } from './activation.js';
import { APPLICATIONS, APPLICATION_IDS } from './applications-catalogue.js';

const RIEN = {
  projets: 0,
  contacts: 0,
  documents: 0,
  ecritures: 0,
  comptesBancaires: 0,
  investissements: 0,
};

function contexte(partiel: Partial<ContexteActivation> = {}): ContexteActivation {
  return { roles: ['entrepreneur'], usage: RIEN, secteurs: [], outilsDeGestion: true, ...partiel };
}

const ids = (liste: Array<{ id: string }>) => liste.map((app) => app.id);

/**
 * CE QUE CHACUN VOIT EN OUVRANT IGNITUX.
 *
 * Chaque exemple de la vision devient un test : si l'un d'eux casse, c'est
 * qu'une personne réelle voit désormais quelque chose qui ne la concerne pas
 * — ou ne voit plus ce qu'elle utilisait.
 */
describe('le lanceur', () => {
  describe('un créateur qui arrive', () => {
    it('voit ses projets, et pas encore de facturation ni de comptabilité', () => {
      const vu = lanceur(contexte());

      expect(ids(vu.applications)).toContain('parcours');
      expect(ids(vu.applications)).not.toContain('facturation');
      expect(ids(vu.applications)).not.toContain('comptabilite');
    });

    it('ne se voit rien suggérer tant qu’il n’a pas de projet', () => {
      expect(lanceur(contexte()).suggestions).toEqual([]);
    });

    it('se voit proposer Relations dès son premier projet, avec la raison', () => {
      const vu = lanceur(contexte({ usage: { ...RIEN, projets: 1 } }));

      expect(ids(vu.suggestions)).toEqual(['relations']);
      expect(vu.suggestions[0].raison).toMatch(/projet/);
    });
  });

  describe('l’enchaînement des suggestions', () => {
    it('propose la facturation quand il y a des contacts', () => {
      const vu = lanceur(contexte({ usage: { ...RIEN, projets: 1, contacts: 3 } }));

      expect(ids(vu.applications)).toContain('relations');
      expect(ids(vu.suggestions)).toContain('facturation');
      expect(ids(vu.suggestions)).not.toContain('banque');
    });

    it('propose les stocks à un secteur concerné, jamais à un autre', () => {
      const concerne = lanceur(
        contexte({ usage: { ...RIEN, projets: 1 }, secteurs: ['Restauration'] }),
      );
      expect(ids(concerne.suggestions)).toContain('stocks');

      const logiciel = lanceur(
        contexte({ usage: { ...RIEN, projets: 1 }, secteurs: ['Logiciel'] }),
      );
      expect(ids(logiciel.suggestions)).not.toContain('stocks');
    });

    it('n’en propose jamais plus de deux à la fois', () => {
      // Un cas artificiel où tout serait prêt sans rien d'utilisé : la
      // limite doit tenir quand même.
      const vu = lanceur(
        contexte({ usage: { ...RIEN, projets: 1, contacts: 0, documents: 0, ecritures: 0 } }),
      );
      expect(vu.suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    });
  });

  describe('ce qu’on utilise déjà est toujours là', () => {
    it('un compte qui facture déjà retrouve la facturation au premier plan', () => {
      const vu = lanceur(contexte({ usage: { ...RIEN, projets: 1, documents: 4 } }));

      expect(ids(vu.applications)).toContain('facturation');
      expect(ids(vu.suggestions)).not.toContain('facturation');
    });

    it('même après avoir rendu le rôle entrepreneur', () => {
      const vu = lanceur(
        contexte({ roles: ['investisseur'], usage: { ...RIEN, documents: 2 } }),
      );

      expect(ids(vu.applications)).toContain('facturation');
    });
  });

  describe('l’investisseur', () => {
    it('voit son portefeuille, et rien de la gestion d’une entreprise', () => {
      const vu = lanceur(contexte({ roles: ['investisseur'] }));

      expect(ids(vu.applications)).toContain('portefeuille');
      expect(ids(vu.applications)).not.toContain('parcours');
      expect(ids(vu.suggestions)).toEqual([]);
      expect(ids(vu.prevues)).not.toContain('caisse');
    });

    it('voit les deux quand il tient les deux rôles', () => {
      const vu = lanceur(contexte({ roles: ['entrepreneur', 'investisseur'] }));

      expect(ids(vu.applications)).toEqual(expect.arrayContaining(['parcours', 'portefeuille']));
    });
  });

  describe('un compte antérieur aux rôles', () => {
    // L'ancien menu lui montrait l'espace entrepreneur : le lanceur ne doit
    // pas lui retirer ce qu'il avait.
    it('est traité en entrepreneur, et le lanceur le dit', () => {
      const vu = lanceur(contexte({ roles: [] }));

      expect(vu.rolesRetenus).toEqual(['entrepreneur']);
      expect(ids(vu.applications)).toContain('parcours');
    });
  });

  describe('les applications prévues', () => {
    // Le tri par pertinence de secteur (`prevues.sort` dans activation.ts)
    // s'est démontré avec Immobilier tant qu'elle restait prévue — devenue
    // disponible le 27/09/2026, Équipe est la seule prévue restante, et son
    // `secteurs` est vide : plus aucune prévue réelle n'a de secteur déclaré
    // pour distinguer un ordre. Ce test vérifie ce qui reste vrai : Équipe
    // n'est jamais « pour toi » sous prétexte qu'un projet a un secteur.
    it('n’est jamais « pour toi » sans secteur déclaré, même avec un secteur de projet', () => {
      const vu = lanceur(contexte({ secteurs: ['Immobilier'] }));
      const equipe = vu.prevues.find((app) => app.id === 'equipe');

      expect(equipe?.pourToi).toBe(false);
    });

    it('ne s’ouvrent jamais : aucune route', () => {
      const vu = lanceur(contexte());

      expect(vu.prevues.every((app) => app.route === null)).toBe(true);
    });

    it('l’équipe dit pourquoi elle tarde', () => {
      const equipe = lanceur(contexte()).prevues.find((app) => app.id === 'equipe');

      expect(equipe?.cadre).toMatch(/agréé/);
    });
  });

  describe('l’offre', () => {
    it('signale ce qui est hors offre sans le cacher', () => {
      const vu = lanceur(
        contexte({ outilsDeGestion: false, usage: { ...RIEN, projets: 1, contacts: 1 } }),
      );
      const facturation = vu.suggestions.find((app) => app.id === 'facturation');

      expect(facturation?.horsOffre).toBe(true);
    });
  });

  describe('le bureau est à la personne', () => {
    it('une application ajoutée depuis la boutique y est, même hors de ses rôles', () => {
      const vu = lanceur(contexte({ roles: ['investisseur'], choix: { facturation: 'ajoutee' } }));

      expect(ids(vu.applications)).toContain('facturation');
      expect(ids(vu.boutique)).not.toContain('facturation');
    });

    it('une application retirée n’y est plus, même utilisée, et IGINI cesse de la proposer', () => {
      const vu = lanceur(
        contexte({
          usage: { ...RIEN, projets: 1, contacts: 3 },
          choix: { relations: 'retiree', facturation: 'retiree' },
        }),
      );

      expect(ids(vu.applications)).not.toContain('relations');
      expect(ids(vu.suggestions)).not.toContain('facturation');
      expect(ids(vu.boutique)).toEqual(expect.arrayContaining(['relations', 'facturation']));
    });

    it('la boutique propose tout ce qui existe et n’est pas sur le bureau — rien de prévu, aucun réglage', () => {
      const vu = lanceur(contexte());
      const surLeBureau = new Set(ids(vu.applications));

      for (const app of APPLICATIONS) {
        const attendue = app.statut === 'disponible' && app.categorie !== 'reglages' && !surLeBureau.has(app.id);
        expect(ids(vu.boutique).includes(app.id)).toBe(attendue);
      }
    });

    it('un réglage ne se retire pas', () => {
      const vu = lanceur(contexte({ choix: { compte: 'retiree' } }));

      expect(ids(vu.reglages)).toContain('compte');
      expect(ids(vu.boutique)).not.toContain('compte');
    });

    it('une application prévue ne s’ajoute pas : elle n’ouvrirait sur rien', () => {
      const vu = lanceur(contexte({ choix: { equipe: 'ajoutee' } }));

      expect(ids(vu.applications)).not.toContain('equipe');
      expect(ids(vu.prevues)).toContain('equipe');
    });
  });

  it('range les réglages à part, pour tout le monde', () => {
    for (const roles of [['entrepreneur'], ['investisseur'], []] as const) {
      const vu = lanceur(contexte({ roles: [...roles] }));
      expect(ids(vu.reglages)).toEqual(expect.arrayContaining(['profil', 'compte', 'offres']));
      expect(ids(vu.applications)).not.toContain('profil');
    }
  });
});

describe('le catalogue', () => {
  it('décrit chaque identifiant une fois, et seulement une', () => {
    expect(APPLICATIONS.map((app) => app.id).sort()).toEqual([...APPLICATION_IDS].sort());
  });

  it('une application disponible s’ouvre quelque part ; une prévue nulle part', () => {
    for (const app of APPLICATIONS) {
      if (app.statut === 'disponible') expect(app.route).toMatch(/^\//);
      else expect(app.route).toBeNull();
    }
  });

  it('une application qui peut être suggérée dit pourquoi', () => {
    for (const app of APPLICATIONS) {
      if (app.statut === 'disponible' && !app.essentielle && app.categorie !== 'reglages') {
        expect(app.pourquoi).toBeTruthy();
      }
    }
  });
});
