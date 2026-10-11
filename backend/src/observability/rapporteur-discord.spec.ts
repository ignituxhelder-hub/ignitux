import { signalerErreur } from './rapporteur-erreurs.js';

/**
 * Discord n'accepte qu'un message `{ content }` de 2 000 caractères au plus :
 * le format maison du rapporteur y serait refusé (400) et l'alerte perdue.
 * Les protections restent les mêmes : rien ne sort qui ne soit nommé.
 */
describe('rapporteur d’erreurs — salon Discord', () => {
  const original = process.env.ERREURS_WEBHOOK_URL;
  afterEach(() => {
    process.env.ERREURS_WEBHOOK_URL = original;
    vi.unstubAllGlobals();
  });

  const RAPPORT = {
    reference: 'abc123',
    methode: 'POST',
    chemin: '/auth/reset-password?token=secret-jeton',
    message: 'jean.dupont@exemple.fr a échoué',
    pile: 'Error: x\n    at C:\\Users\\helder\\backend\\src\\x.ts:1:1',
    utilisateurId: 'u1',
    moment: '2026-10-11T08:00:00.000Z',
  };

  function envoyer(url: string, rapport = RAPPORT) {
    process.env.ERREURS_WEBHOOK_URL = url;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    signalerErreur(rapport);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(fetchMock.mock.calls[0][1].body as string);
  }

  it('envoie un message { content } lisible à un webhook Discord', () => {
    const corps = envoyer('https://discord.com/api/webhooks/123/jeton');

    expect(Object.keys(corps)).toEqual(['content']);
    expect(corps.content).toContain('abc123');
    expect(corps.content).toContain('POST /auth/reset-password');
  });

  it('garde les protections : ni jeton de la chaîne de requête, ni adresse, ni nom d’utilisateur', () => {
    const { content } = envoyer('https://discordapp.com/api/webhooks/123/jeton');

    expect(content).not.toContain('secret-jeton');
    expect(content).not.toContain('jean.dupont@exemple.fr');
    expect(content).not.toContain('helder');
  });

  it('tient dans la limite de 2 000 caractères de Discord, même avec une longue pile', () => {
    const { content } = envoyer('https://discord.com/api/webhooks/123/jeton', {
      ...RAPPORT,
      pile: 'x'.repeat(10_000),
    });

    expect(content.length).toBeLessThanOrEqual(2000);
  });

  it('garde le format maison pour tout autre collecteur', () => {
    const corps = envoyer('https://collecteur.exemple/hook');
    expect(corps).toHaveProperty('reference', 'abc123');
    expect(corps).not.toHaveProperty('content');
  });
});
