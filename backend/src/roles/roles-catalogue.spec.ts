import { ROLES, domainsOf, foreignDomains, isRoleId, openRoles } from './roles-catalogue.js';

describe('catalogue des rôles', () => {
  it('ouvre entrepreneur et investisseur, et eux seuls', () => {
    expect(openRoles().map((role) => role.id)).toEqual(['entrepreneur', 'investisseur']);
  });

  // La séparation ne tient que si les deux espaces ne lisent pas la même
  // chose. Ce test échouerait le jour où quelqu'un ajouterait « projets » aux
  // domaines de l'investisseur pour aller plus vite.
  it("ne laisse aucun domaine commun entre deux rôles ouverts", () => {
    const ouverts = openRoles();
    for (const a of ouverts) {
      for (const b of ouverts) {
        if (a.id === b.id) continue;
        const commun = a.domains.filter((domain) => b.domains.includes(domain));
        expect(commun, `${a.id} et ${b.id} partagent ${commun.join(', ')}`).toEqual([]);
      }
    }
  });

  it('donne un espace à tout rôle ouvert, et aucun aux autres', () => {
    for (const role of ROLES) {
      if (role.available) expect(role.home, role.id).not.toBeNull();
      else expect(role.home, role.id).toBeNull();
    }
  });

  // Un rôle fermé ne doit rien pouvoir lire : le jour où l'un d'eux s'ouvre,
  // ses domaines seront écrits exprès, pas hérités par oubli.
  it('ne donne aucun domaine à un rôle fermé', () => {
    for (const role of ROLES.filter((r) => !r.available)) {
      expect(role.domains, role.id).toEqual([]);
    }
  });

  describe('foreignDomains', () => {
    it('ne reproche rien à une vue conforme', () => {
      expect(foreignDomains('investisseur', ['investissements', 'portefeuille'])).toEqual([]);
    });

    it("nomme le domaine qui n'appartient pas au rôle", () => {
      expect(foreignDomains('investisseur', ['portefeuille', 'projets'])).toEqual(['projets']);
    });

    // Une faute de frappe dans un identifiant de rôle doit fermer, pas ouvrir.
    it('refuse tout à un rôle inconnu', () => {
      expect(foreignDomains('entreprenneur', ['projets'])).toEqual(['projets']);
      expect(domainsOf('entreprenneur')).toEqual([]);
    });

    it('refuse tout à un rôle déclaré mais fermé', () => {
      expect(foreignDomains('mentor', ['projets'])).toEqual(['projets']);
    });
  });

  it('reconnaît les identifiants du catalogue, et eux seuls', () => {
    expect(isRoleId('entrepreneur')).toBe(true);
    expect(isRoleId('mentor')).toBe(true);
    expect(isRoleId('fondateur')).toBe(false);
  });
});
