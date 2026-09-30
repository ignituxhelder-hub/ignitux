import { expurger, rapporteurActif, signalerErreur } from './rapporteur-erreurs.js';

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
});
