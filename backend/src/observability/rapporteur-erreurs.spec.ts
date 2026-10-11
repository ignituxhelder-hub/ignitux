import { expurger, rapporteurActif, signalerErreur, type RapportErreur } from './rapporteur-erreurs.js';

/**
 * CE QUI PART, ET RIEN D'AUTRE.
 *
 * Le rapporteur existe pour qu'un défaut en production se découvre avant
 * qu'une personne l'écrive. Le risque qu'il introduit est symétrique : un
 * collecteur d'erreurs mal cadré devient lui-même une fuite de données
 * personnelles. Ces tests portent sur ce risque, pas sur le confort.
 */
describe('expurger', () => {
  it('retire une adresse email du texte', () => {
    expect(expurger("l'adresse jean.dupont@exemple.fr existe déjà")).toBe(
      "l'adresse [adresse retirée] existe déjà",
    );
  });

  it('retire un chemin Windows qui porte un nom d’utilisateur', () => {
    const pile = 'at Object.<anonymous> (C:\\Users\\helder\\projet\\fichier.ts:12:4)';
    expect(expurger(pile)).not.toContain('helder');
    expect(expurger(pile)).toContain('C:\\Users\\[retiré]');
  });

  it('retire un chemin Unix qui porte un nom d’utilisateur', () => {
    expect(expurger('/home/helder/projet/fichier.ts')).toBe('/home/[retiré]/projet/fichier.ts');
  });

  it('laisse intact un texte qui ne contient rien de personnel', () => {
    expect(expurger('Invalid `prisma.projects.findMany()` invocation')).toBe(
      'Invalid `prisma.projects.findMany()` invocation',
    );
  });
});

describe('signalerErreur', () => {
  const original = process.env.ERREURS_WEBHOOK_URL;
  afterEach(() => {
    process.env.ERREURS_WEBHOOK_URL = original;
    vi.unstubAllGlobals();
  });

  it('ne fait rien sans adresse configurée : ni requête, ni exception', () => {
    delete process.env.ERREURS_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      signalerErreur({
        reference: 'abc123',
        methode: 'GET',
        chemin: '/projects',
        message: 'x',
        pile: null,
        utilisateurId: null,
        moment: new Date().toISOString(),
      }),
    ).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une adresse qui n’est pas du http(s) — pas d’exécution de commande par variable d’environnement', () => {
    process.env.ERREURS_WEBHOOK_URL = 'file:///etc/passwd';
    expect(rapporteurActif()).toBe(false);
  });

  it('envoie sans le corps de la requête ni les en-têtes — seuls les champs nommés', () => {
    process.env.ERREURS_WEBHOOK_URL = 'https://collecteur.exemple/hook';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    signalerErreur({
      reference: 'abc123',
      methode: 'POST',
      chemin: '/auth/reset-password?token=secret-jeton',
      message: 'jean.dupont@exemple.fr a échoué',
      pile: 'C:\\Users\\helder\\backend\\src\\x.ts:1:1',
      utilisateurId: 'u1',
      moment: '2026-09-26T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://collecteur.exemple/hook');
    const corps = JSON.parse(options.body as string);

    // La chaîne de requête ne doit JAMAIS sortir : un jeton de
    // réinitialisation y circule, et il ouvre un compte.
    expect(corps.chemin).toBe('/auth/reset-password');
    expect(JSON.stringify(corps)).not.toContain('secret-jeton');

    // Le message et la pile arrivent expurgés, pas bruts.
    expect(corps.message).not.toContain('jean.dupont@exemple.fr');
    expect(corps.pile).not.toContain('helder');

    // Seuls les champs nommés : aucun en-tête, aucun corps de requête.
    expect(Object.keys(corps).sort()).toEqual(
      ['chemin', 'message', 'methode', 'moment', 'pile', 'produit', 'reference', 'utilisateurId'].sort(),
    );
  });

  it('n’attend pas la réponse et ne lève jamais si le collecteur est injoignable', async () => {
    process.env.ERREURS_WEBHOOK_URL = 'https://collecteur.exemple/hook';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    expect(() =>
      signalerErreur({
        reference: 'abc123',
        methode: 'GET',
        chemin: '/health',
        message: 'x',
        pile: null,
        utilisateurId: null,
        moment: new Date().toISOString(),
      }),
    ).not.toThrow();

    // Laisse la promesse rejetée se résoudre avant la fin du test, pour
    // vérifier que le .catch() interne l'a bien absorbée.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('borne l’attente du collecteur à 5 secondes', () => {
    process.env.ERREURS_WEBHOOK_URL = 'https://collecteur.exemple/hook';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    signalerErreur(RAPPORT);

    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
    timeout.mockRestore();
  });
});

const RAPPORT: RapportErreur = {
  reference: 'abc123',
  methode: 'POST',
  chemin: '/auth/reset-password?token=secret-jeton',
  message: 'jean.dupont@exemple.fr a échoué',
  pile: [
    'Error: jean.dupont@exemple.fr a échoué',
    '    at f (C:\\Users\\helder\\backend\\src\\x.ts:1:1)',
    '    at g (/home/helder/y.ts:2:2)',
  ].join('\n'),
  utilisateurId: '6f1c2a3b-0d4e-4f5a-8b6c-7d8e9f0a1b2c',
  moment: '2026-10-11T08:00:00.000Z',
};

/** Une pile de `lignes` lignes longues, pour éprouver la troncature. */
function grossePile(lignes: number): string {
  return Array.from({ length: lignes }, (_, i) => `    at fonction${i} (${'x'.repeat(80)}.ts:1:1)`).join('\n');
}

describe('signalerErreur — vers un webhook Discord', () => {
  const original = process.env.ERREURS_WEBHOOK_URL;
  afterEach(() => {
    process.env.ERREURS_WEBHOOK_URL = original;
    vi.unstubAllGlobals();
  });

  function envoyer(url: string, rapport: RapportErreur = RAPPORT) {
    process.env.ERREURS_WEBHOOK_URL = url;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    signalerErreur(rapport);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [cible, options] = fetchMock.mock.calls[0];
    return { cible, options, corps: JSON.parse(options.body as string) };
  }

  it.each([
    'https://discord.com/api/webhooks/123/jeton',
    'https://discordapp.com/api/webhooks/123/jeton',
  ])('envoie { content } au format Discord pour %s', (url) => {
    const { cible, options, corps } = envoyer(url);

    expect(cible).toBe(url);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    // Le texte, et aucune mention : un « @everyone » glissé dans un message
    // d'erreur ne doit réveiller personne.
    expect(Object.keys(corps).sort()).toEqual(['allowed_mentions', 'content']);
    expect(corps.allowed_mentions).toEqual({ parse: [] });

    const [premiere, deuxieme] = (corps.content as string).split('\n');
    expect(premiere).toBe(
      'Erreur Ignitux — réf abc123 — POST /auth/reset-password — 2026-10-11T08:00:00.000Z',
    );
    expect(deuxieme).toBe('[adresse retirée] a échoué');
  });

  it('garde les garanties : ni chaîne de requête, ni donnée personnelle, ni identifiant', () => {
    const { corps } = envoyer('https://discord.com/api/webhooks/123/jeton');
    const texte = corps.content as string;

    expect(texte).not.toContain('secret-jeton');
    expect(texte).not.toContain('jean.dupont@exemple.fr');
    expect(texte).not.toContain('helder');
    expect(texte).not.toContain(RAPPORT.utilisateurId);
  });

  it('joint le début de la pile expurgée dans un bloc de code', () => {
    const { corps } = envoyer('https://discord.com/api/webhooks/123/jeton');
    const texte = corps.content as string;

    expect(texte).toContain('\n```\n');
    expect(texte.endsWith('\n```')).toBe(true);
    expect(texte).toContain('at f (C:\\Users\\[retiré]\\backend');
    expect(texte).toContain('at g (/home/[retiré]/y.ts:2:2)');
  });

  it('se passe du bloc quand il n’y a pas de pile', () => {
    const { corps } = envoyer('https://discord.com/api/webhooks/123/jeton', { ...RAPPORT, pile: null });
    expect(corps.content).not.toContain('```');
  });

  it('tronque à 2 000 caractères au plus — message et pile énormes', () => {
    const { corps } = envoyer('https://discord.com/api/webhooks/123/jeton', {
      ...RAPPORT,
      message: 'm'.repeat(5_000),
      pile: grossePile(200),
    });
    const texte = corps.content as string;

    expect(texte.length).toBeLessThanOrEqual(2_000);
    expect(texte.startsWith('Erreur Ignitux — réf abc123')).toBe(true);
    expect(texte).toContain('…');
  });

  it('tronque la pile sans casser le bloc de code', () => {
    const { corps } = envoyer('https://discord.com/api/webhooks/123/jeton', {
      ...RAPPORT,
      message: 'm'.repeat(1_500),
      pile: grossePile(50),
    });
    const texte = corps.content as string;

    expect(texte.length).toBeLessThanOrEqual(2_000);
    // Un bloc ouvert est toujours refermé.
    expect((texte.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it('garde la charge générique pour une adresse qui n’est pas un webhook Discord', () => {
    for (const url of [
      'https://collecteur.exemple/api/webhooks/123',
      'https://discord.com/autre-chose',
      'https://discord.com.attaquant.exemple/api/webhooks/123/jeton',
    ]) {
      const { corps } = envoyer(url);
      expect(corps).not.toHaveProperty('content');
      expect(corps.produit).toBe('ignitux');
      vi.unstubAllGlobals();
    }
  });

  it('ne lève jamais si Discord est injoignable', async () => {
    process.env.ERREURS_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/jeton';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(() => signalerErreur(RAPPORT)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
