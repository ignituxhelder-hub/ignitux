import {
  parseMailTransport,
  parseTrustProxy,
  productionProblems,
  shouldServeApiDocs,
  type PreflightInput,
} from './production-preflight.js';

/** Une production entièrement saine, dont chaque test dégrade un réglage. */
function saine(overrides: PreflightInput = {}): PreflightInput {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/ignitux_prod',
    JWT_SECRET: 'g7K2mQ9wR4tY8uI1oP6aS3dF5gH0jK2l',
    FRONTEND_URL: 'https://app.ignitux.com',
    TRUST_PROXY: '1',
    MAIL_TRANSPORT: 'smtp',
    MAIL_FROM: 'Ignitux <bonjour@ignitux.com>',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'apikey',
    SMTP_PASSWORD: 'secret',
    IGNITUX_RAISON_SOCIALE: 'Ignitux',
    IGNITUX_ADRESSE: '1 rue Exemple, 00000 Ville, France',
    IGNITUX_EMAIL: 'contact@exemple.fr',
    ...overrides,
  };
}

function problemesSur(overrides: PreflightInput): string[] {
  return productionProblems(saine(overrides)).map((p) => p.setting);
}

describe('préflight de production', () => {
  it('ne reproche rien à une configuration saine', () => {
    expect(productionProblems(saine())).toEqual([]);
  });

  // Ces exigences n'ont de sens que face à de vrais comptes. Les imposer en
  // développement ferait perdre du temps sans rien protéger.
  it("ne s'applique pas hors production", () => {
    expect(
      productionProblems({
        NODE_ENV: 'development',
        JWT_SECRET: 'change-me',
        FRONTEND_URL: 'http://localhost:3001',
        DATABASE_URL: 'postgresql://u:p@h:5432/postgres',
      }),
    ).toEqual([]);
  });

  describe('le secret de signature', () => {
    // La valeur d'exemple est publique : elle est dans le dépôt.
    it("refuse une valeur d'exemple du dépôt", () => {
      expect(problemesSur({ JWT_SECRET: 'change-me-generate-a-long-random-secret' })).toContain(
        'JWT_SECRET',
      );
    });

    it('refuse un secret trop court', () => {
      expect(problemesSur({ JWT_SECRET: 'court' })).toContain('JWT_SECRET');
    });
  });

  describe("l'origine du frontend", () => {
    it.each(['http://localhost:3001', 'http://127.0.0.1:3001', 'http://0.0.0.0:3001'])(
      'refuse une adresse locale (%s)',
      (url) => {
        expect(problemesSur({ FRONTEND_URL: url })).toContain('FRONTEND_URL');
      },
    );

    // Un jeton de session qui circule en clair s'intercepte.
    it('exige https', () => {
      expect(problemesSur({ FRONTEND_URL: 'http://app.ignitux.com' })).toContain('FRONTEND_URL');
    });
  });

  describe('la base', () => {
    // La faute la plus coûteuse : de vraies personnes écrivant au milieu des
    // données d'essai, sans qu'aucune erreur ne le signale.
    it('refuse la base de développement', () => {
      expect(
        problemesSur({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/postgres' }),
      ).toContain('DATABASE_URL');
    });

    it('accepte la base de production', () => {
      expect(
        problemesSur({ DATABASE_URL: 'postgresql://u:p@db.supabase.co:5432/ignitux_prod' }),
      ).not.toContain('DATABASE_URL');
    });
  });

  describe('le proxy', () => {
    // Ne pas trancher est la seule réponse refusée : le mauvais défaut est
    // silencieux dans les deux sens.
    it('refuse une valeur absente', () => {
      expect(problemesSur({ TRUST_PROXY: undefined })).toContain('TRUST_PROXY');
    });

    it('accepte « false » : ne pas avoir de proxy est une réponse', () => {
      expect(problemesSur({ TRUST_PROXY: 'false' })).not.toContain('TRUST_PROXY');
    });

    it('accepte un nombre de sauts', () => {
      expect(problemesSur({ TRUST_PROXY: '2' })).not.toContain('TRUST_PROXY');
    });

    it('refuse une valeur illisible', () => {
      expect(problemesSur({ TRUST_PROXY: 'oui' })).toContain('TRUST_PROXY');
    });
  });

  describe("l'email", () => {
    // Par omission, la réinitialisation de mot de passe échoue en silence.
    it('refuse un transport non déclaré', () => {
      expect(problemesSur({ MAIL_TRANSPORT: undefined })).toContain('MAIL_TRANSPORT');
    });

    it('accepte « log » : tourner sans email est une décision, pas un oubli', () => {
      expect(
        productionProblems(
          saine({
            MAIL_TRANSPORT: 'log',
            SMTP_HOST: undefined,
            SMTP_USER: undefined,
            SMTP_PASSWORD: undefined,
            MAIL_FROM: undefined,
          }),
        ),
      ).toEqual([]);
    });

    it('exige les identifiants quand le transport est smtp', () => {
      const manquants = problemesSur({
        SMTP_HOST: undefined,
        SMTP_USER: '',
        SMTP_PASSWORD: undefined,
        MAIL_FROM: undefined,
      });
      expect(manquants).toEqual(
        expect.arrayContaining(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']),
      );
    });

    it('refuse un port invalide', () => {
      expect(problemesSur({ SMTP_PORT: '70000' })).toContain('SMTP_PORT');
    });
  });

  it('accumule les problèmes au lieu de s’arrêter au premier', () => {
    // Corriger un réglage pour découvrir le suivant au redémarrage suivant
    // ferait perdre un aller-retour par faute.
    const tout = productionProblems({ NODE_ENV: 'production' });
    expect(tout.length).toBeGreaterThanOrEqual(5);
  });

  it('dit quoi faire, pas seulement ce qui ne va pas', () => {
    for (const p of productionProblems({ NODE_ENV: 'production' })) {
      expect(p.detail.length, p.setting).toBeGreaterThan(40);
    }
  });
});

describe('parseTrustProxy', () => {
  it.each([
    ['1', 1],
    ['3', 3],
    ['false', false],
    ['off', false],
    ['0', false],
    ['FALSE', false],
  ])('lit « %s »', (entree, attendu) => {
    expect(parseTrustProxy(entree)).toBe(attendu);
  });

  it.each([undefined, '', '  ', 'true', 'oui', '-1', '10', '1.5'])(
    'rend null pour « %s » — faute de réponse claire, on ne devine pas',
    (entree) => {
      expect(parseTrustProxy(entree)).toBeNull();
    },
  );
});

describe('parseMailTransport', () => {
  it.each([
    ['smtp', 'smtp'],
    ['SMTP', 'smtp'],
    ['log', 'log'],
  ])('lit « %s »', (entree, attendu) => {
    expect(parseMailTransport(entree)).toBe(attendu);
  });

  it.each([undefined, '', 'resend', 'sendmail'])('rend null pour « %s »', (entree) => {
    expect(parseMailTransport(entree)).toBeNull();
  });
});

describe('documentation d’API', () => {
  it('est servie en développement', () => {
    expect(shouldServeApiDocs({ NODE_ENV: 'development' })).toBe(true);
  });

  it('est éteinte en production par défaut', () => {
    expect(shouldServeApiDocs({ NODE_ENV: 'production' })).toBe(false);
  });

  it('se rallume sur demande explicite', () => {
    expect(shouldServeApiDocs({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' })).toBe(true);
  });

  describe('identité légale', () => {
    // Un service ouvert au public doit publier qui l édite, et une facture
    // sans raison sociale ni adresse est un document sans valeur. Les deux
    // se decouvrent tard : a une mise en demeure, ou a un controle.
    it('refuse de démarrer sans raison sociale', () => {
      expect(problemesSur({ IGNITUX_RAISON_SOCIALE: '' })).toContain('IGNITUX_RAISON_SOCIALE');
    });

    it('refuse de démarrer sans adresse', () => {
      expect(problemesSur({ IGNITUX_ADRESSE: undefined })).toContain('IGNITUX_ADRESSE');
    });

    it('refuse de démarrer sans adresse de contact', () => {
      expect(problemesSur({ IGNITUX_EMAIL: '   ' })).toContain('IGNITUX_EMAIL');
    });

    // Une activité peut demarrer avant son immatriculation, et toutes ne
    // sont pas assujetties a la TVA. Les exiger bloquerait a tort.
    it('n exige ni SIREN ni numéro de TVA', () => {
      expect(problemesSur({})).toEqual([]);
    });

    it('dit quoi faire, pas seulement ce qui manque', () => {
      const probleme = productionProblems(saine({ IGNITUX_ADRESSE: '' })).find(
        (p) => p.setting === 'IGNITUX_ADRESSE',
      );

      expect(probleme?.detail).toMatch(/renseigne/i);
    });
  });
});
