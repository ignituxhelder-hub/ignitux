import { SECTEURS } from '../profile/profile-fields.js';
import {
  COMPLIANCE_REQUIREMENTS_FR,
  DERNIERE_VERIFICATION,
} from './compliance-requirements.js';

/**
 * Ce que ce fichier de test protège n'est pas du code, c'est du contenu
 * juridique. Les défauts qu'on y attrape sont ceux qui ne provoquent
 * aucune erreur à l'exécution — un lien mort, un secteur mal orthographié,
 * une date qui ne bouge plus — et qui font pourtant dire au produit des
 * choses fausses à quelqu'un qui monte une entreprise réelle.
 */
describe('référentiel de conformité', () => {
  it("n'est pas vide", () => {
    expect(COMPLIANCE_REQUIREMENTS_FR.length).toBeGreaterThan(0);
  });

  it('ne contient pas deux fois le même slug', () => {
    const slugs = COMPLIANCE_REQUIREMENTS_FR.map((r) => r.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // Article 15 : une règle propre à un pays cite sa source officielle. Le
  // moteur constitutionnel vérifie déjà qu'une source EXISTE ; ici on
  // vérifie qu'elle a une chance de répondre.
  describe('les sources', () => {
    it('sont toutes en https', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(r.sourceUrl, r.slug).toMatch(/^https:\/\//);
      }
    });

    // Le domaine a migré et les anciennes adresses renvoient un 404 après
    // redirection. Sept liens sont tombés comme ça sans que rien ne le dise.
    it("ne pointent pas vers un domaine dont on sait qu'il a déménagé", () => {
      const demenages = [/\bservice-public\.fr\b/, /\bwww\.service-public\.fr\b/];
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        for (const mort of demenages) {
          expect(r.sourceUrl, `${r.slug} : ${r.sourceUrl}`).not.toMatch(mort);
        }
      }
    });

    it('viennent toutes d’un domaine public officiel', () => {
      const officiels = /\.(gouv\.fr|cnil\.fr|insee\.fr|urssaf\.fr|impots\.gouv\.fr)$/;
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        const hote = new URL(r.sourceUrl).hostname;
        expect(officiels.test(hote), `${r.slug} : ${hote}`).toBe(true);
      }
    });

    it('portent une date de vérification', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(r.verifiedOn, r.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(r.verifiedOn)), r.slug).toBe(false);
      }
    });

    it('ont toutes été vérifiées lors de la dernière campagne', () => {
      // Si un item reste en arrière, c'est qu'on a ajouté du contenu sans
      // ouvrir sa source. Mieux vaut le voir ici qu'en production.
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(r.verifiedOn, r.slug).toBe(DERNIERE_VERIFICATION);
      }
    });
  });

  describe('les secteurs', () => {
    // Un secteur mal orthographié ne lève rien : la démarche cesse
    // simplement d'être pertinente pour qui que ce soit, en silence.
    it('existent tous dans la liste proposée au profil', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        for (const secteur of r.sectors) {
          expect(SECTEURS as readonly string[], `${r.slug} : ${secteur}`).toContain(secteur);
        }
      }
    });

    it('sont déclarés sur chaque item, même vides', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(Array.isArray(r.sectors), r.slug).toBe(true);
      }
    });

    // Un référentiel où tout serait sectoriel n'aurait plus de socle
    // commun ; un référentiel où rien ne l'est rendrait le tri inutile.
    it('laissent un socle commun à toute activité', () => {
      const universelles = COMPLIANCE_REQUIREMENTS_FR.filter((r) => r.sectors.length === 0);

      expect(universelles.length).toBeGreaterThan(0);
    });
  });

  describe('la rédaction', () => {
    // Un seuil écrit en dur devient faux à la loi de finances suivante, et
    // personne ne s'en aperçoit avant qu'un utilisateur s'y fie.
    it('ne fige aucun montant en euros dans les descriptions', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(r.description, r.slug).not.toMatch(/\d[\d\s  ]*(€|euros)/);
      }
    });

    it('donne à chaque item un titre et une description non vides', () => {
      for (const r of COMPLIANCE_REQUIREMENTS_FR) {
        expect(r.title.trim().length, r.slug).toBeGreaterThan(0);
        expect(r.description.trim().length, r.slug).toBeGreaterThan(20);
      }
    });
  });
});
