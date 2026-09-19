import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_GROUPS,
  USER_DATA_SCOPE,
  exclusions,
  exportedTables,
} from './user-data-scope.js';

/** Les modèles réellement déclarés dans le schéma, lus depuis le fichier. */
function modelsInSchema(): string[] {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

describe('périmètre des données personnelles', () => {
  describe('couverture du schéma', () => {
    it('classe chaque table du schéma, sans exception', () => {
      // LE test de ce module. Les CGU énumèrent dix catégories de données
      // collectées ; un export qui en oublierait une rendrait ce document
      // faux. Ajouter une table sans la classer casse ici, au moment où
      // c'est encore facile à corriger — et pas le jour où quelqu'un
      // demande ses données.
      const unclassified = modelsInSchema().filter((model) => !(model in USER_DATA_SCOPE));

      expect(unclassified).toEqual([]);
    });

    it('ne classe aucune table qui n\'existe plus', () => {
      // L'inverse compte autant : une table supprimée mais toujours listée
      // ferait planter l'export sur une requête vers rien.
      const models = new Set(modelsInSchema());
      const ghosts = Object.keys(USER_DATA_SCOPE).filter((table) => !models.has(table));

      expect(ghosts).toEqual([]);
    });

    it('trouve bien des modèles dans le schéma', () => {
      // Garde-fou du garde-fou : si la lecture du fichier échouait ou si le
      // format changeait, les deux tests précédents passeraient sur une
      // liste vide et ne vérifieraient plus rien.
      expect(modelsInSchema().length).toBeGreaterThan(20);
    });
  });

  describe('exclusions', () => {
    it('motive chaque exclusion par une phrase explicite', () => {
      for (const exclusion of exclusions()) {
        expect(exclusion.pourquoi.length).toBeGreaterThan(40);
      }
    });

    it("n'exporte pas les jetons d'authentification", () => {
      // Même hachés, ils n'apprennent rien à la personne et finiraient dans
      // un fichier qui circule par email.
      expect(USER_DATA_SCOPE.auth_tokens.kind).toBe('excluded');
    });

    it('exclut les données de référence, identiques pour tout le monde', () => {
      expect(USER_DATA_SCOPE.compliance_requirements.kind).toBe('excluded');
      expect(USER_DATA_SCOPE.constitution_articles.kind).toBe('excluded');
    });
  });

  describe('les catégories des CGU sont toutes couvertes', () => {
    it('exporte au moins une table par groupe annoncé', () => {
      // Un groupe annoncé dans les CGU mais vide dans l'export serait une
      // promesse sans contenu.
      const groups = new Set(
        Object.values(USER_DATA_SCOPE)
          .filter((treatment) => treatment.kind === 'exported')
          .map((treatment) => (treatment as { group: string }).group),
      );

      for (const group of EXPORT_GROUPS) {
        expect(groups.has(group)).toBe(true);
      }
    });

    it.each([
      ['le CRM et ses trois tables', ['crm_contacts', 'crm_companies', 'crm_interactions']],
      ['la facturation', ['billing_documents', 'billing_lines', 'billing_payments']],
      [
        'le financement',
        ['financing_rounds', 'equity_holders', 'equity_events', 'dividend_distributions'],
      ],
      ['le journal des violations', ['constitution_violations']],
    ])('exporte %s', (_label, tables) => {
      // Ces quatre ensembles sont ceux qui manquaient à la liste RGPD avant
      // sa correction (voir PROGRESS.md §11.1) : ils sont nommés un par un
      // pour que l'oubli ne puisse pas se reproduire silencieusement.
      const exported = new Set(exportedTables());
      for (const table of tables) {
        expect(exported.has(table)).toBe(true);
      }
    });
  });
});
