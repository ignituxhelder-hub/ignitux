import {
  CREATEUR,
  ibanComplet,
  identiteLegale,
  manquePourFacturer,
  masquerIban,
  MENTION_PATERNITE,
  pourAffichage,
} from './identite-ignitux.js';

const CLES = [
  'IGNITUX_RAISON_SOCIALE',
  'IGNITUX_ADRESSE',
  'IGNITUX_EMAIL',
  'IGNITUX_IDENTIFIANT',
  'IGNITUX_TVA',
  'IGNITUX_IBAN',
  'IGNITUX_BIC',
];

describe('identité légale', () => {
  // On sauvegarde et restaure UNIQUEMENT les clés touchées ici.
  //
  // Remplacer `process.env` en entier paraissait plus simple et a fait
  // tomber un test de messagerie sans rapport : l'objet est partagé dans le
  // processus, donc écraser sa référence efface ce qu'un autre fichier y
  // avait posé. Un test qui casse un autre test est un piège, pas un filet.
  const initial: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const cle of CLES) {
      initial[cle] = process.env[cle];
      delete process.env[cle];
    }
  });

  afterEach(() => {
    for (const cle of CLES) {
      if (initial[cle] === undefined) delete process.env[cle];
      else process.env[cle] = initial[cle];
    }
  });

  // Une adresse inventée sur une facture est une facture fausse. Le module
  // préfère ne rien dire à dire quelque chose de plausible.
  it('rend null pour ce qui n’est pas configuré, jamais une valeur plausible', () => {
    const identite = identiteLegale();

    expect(identite.raisonSociale).toBeNull();
    expect(identite.adresse).toBeNull();
    expect(identite.email).toBeNull();
    expect(identite.identifiant).toBeNull();
  });

  it('traite une variable vide comme absente', () => {
    process.env.IGNITUX_ADRESSE = '   ';

    expect(identiteLegale().adresse).toBeNull();
  });

  it('lit ce qui est configuré', () => {
    process.env.IGNITUX_RAISON_SOCIALE = 'Ignitux';
    process.env.IGNITUX_EMAIL = 'contact@exemple.fr';

    const identite = identiteLegale();
    expect(identite.raisonSociale).toBe('Ignitux');
    expect(identite.email).toBe('contact@exemple.fr');
  });

  describe('l’IBAN', () => {
    // Un IBAN complet dans une réponse HTTP finit dans un journal, un cache
    // de navigateur, une capture d'écran envoyée au support.
    it('ne sort jamais entier de pourAffichage', () => {
      process.env.IGNITUX_IBAN = 'FR7600000000009999999999';

      const affiche = pourAffichage();

      expect(affiche.iban).not.toContain('000000000099');
      expect(JSON.stringify(affiche)).not.toContain('FR7600000000009999999999');
    });

    it('garde le pays et les quatre derniers caractères, qui suffisent à reconnaître le compte', () => {
      expect(masquerIban('FR7600000000009999999999')).toBe('FR•• •••• •••• 9999');
    });

    it('tolère les espaces de la saisie humaine', () => {
      expect(masquerIban('FR76 0000 0000 0099 9999 9999')).toBe('FR•• •••• •••• 9999');
    });

    it('rend null plutôt qu’un masque trompeur sur une valeur trop courte', () => {
      expect(masquerIban('FR76')).toBeNull();
      expect(masquerIban(null)).toBeNull();
      expect(masquerIban(undefined)).toBeNull();
    });

    // Une seule porte vers le numéro entier, pour que `grep` suffise à les
    // énumérer toutes.
    it('n’est accessible en entier que par ibanComplet', () => {
      process.env.IGNITUX_IBAN = 'FR7600000000009999999999';

      expect(ibanComplet()).toBe('FR7600000000009999999999');
      expect(identiteLegale()).not.toHaveProperty('iban');
    });
  });

  describe('ce qu’il faut pour facturer', () => {
    it('nomme précisément ce qui manque', () => {
      expect(manquePourFacturer()).toEqual([
        'IGNITUX_RAISON_SOCIALE',
        'IGNITUX_ADRESSE',
        'IGNITUX_EMAIL',
      ]);
    });

    it('ne réclame rien quand tout est là', () => {
      process.env.IGNITUX_RAISON_SOCIALE = 'Ignitux';
      process.env.IGNITUX_ADRESSE = '1 rue Exemple, 00000 Ville';
      process.env.IGNITUX_EMAIL = 'contact@exemple.fr';

      expect(manquePourFacturer()).toEqual([]);
    });

    // Le SIREN et la TVA ne bloquent pas : une activité peut démarrer avant
    // l'immatriculation, et toutes ne sont pas assujetties à la TVA.
    it('n’exige ni identifiant ni numéro de TVA', () => {
      process.env.IGNITUX_RAISON_SOCIALE = 'Ignitux';
      process.env.IGNITUX_ADRESSE = '1 rue Exemple, 00000 Ville';
      process.env.IGNITUX_EMAIL = 'contact@exemple.fr';

      expect(manquePourFacturer()).not.toContain('IGNITUX_IDENTIFIANT');
      expect(manquePourFacturer()).not.toContain('IGNITUX_TVA');
    });
  });

  describe('paternité du concept', () => {
    // Une constante dans un dépôt n'oblige personne juridiquement. Ce test
    // empêche seulement qu'elle disparaisse par inadvertance.
    it('nomme le créateur', () => {
      expect(CREATEUR).toBe('Helder Filipe Amorim Simões');
      expect(MENTION_PATERNITE).toContain(CREATEUR);
    });

    it('dit que la cession ne transfère pas la paternité', () => {
      expect(MENTION_PATERNITE).toMatch(/ne se transfère pas/);
    });
  });

  // Le module porte de l'identité publiable, pas des secrets. Une clé de
  // paiement qui transiterait ici voyagerait ensuite dans toute
  // l'application au lieu de rester au plus près de son appel.
  it('ne lit aucun secret de fournisseur de paiement', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_valeur_factice';

    expect(JSON.stringify(pourAffichage())).not.toContain('sk_test');

    delete process.env.STRIPE_SECRET_KEY;
  });
});
