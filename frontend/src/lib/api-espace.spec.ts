import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  OfflineQueuedError,
  OfflineReadError,
  readOfflineState,
  replayOfflineQueue,
  setEspaceActif,
  setEspaceAVerifierHandler,
  setOfflineStorage,
  setUtilisateurActif,
} from './api';

/**
 * ÉQUIPE, LIVRAISON 2 — l'en-tête `X-Espace`, côté client.
 *
 * Dans l'espace argent d'un autre, seules les routes de la facturation, de
 * la comptabilité, de la banque et de la caisse portent l'en-tête ; toute
 * autre route ne le porte jamais (le serveur la refuserait). Le cache hors
 * ligne et la file d'attente sont cloisonnés par utilisateur et par espace :
 * une facture lue chez Alice ne doit jamais s'afficher chez Bob, ni chez soi.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

interface Envoi {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function reseau(statut = 200, corps: unknown = []) {
  const envois: Envoi[] = [];
  global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit = {}) => {
    envois.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return Promise.resolve({
      ok: statut >= 200 && statut < 300,
      status: statut,
      json: () => Promise.resolve(corps),
      text: () => Promise.resolve(typeof corps === 'string' ? corps : JSON.stringify(corps)),
      blob: () => Promise.resolve(new Blob(['%PDF'])),
    });
  }) as unknown as typeof fetch;
  return envois;
}

function horsLigne() {
  global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
}

function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    entries,
  };
}

const JOURNEE = { occurredOn: '2026-10-14', cashCents: 1000, cardCents: 0, vatCents: 0 };

beforeEach(() => {
  setEspaceActif(null);
  setUtilisateurActif('u1');
});

afterEach(() => {
  setEspaceActif(null);
  setEspaceAVerifierHandler(null);
  setOfflineStorage(null);
  setUtilisateurActif(null);
  vi.restoreAllMocks();
});

describe('l’en-tête X-Espace', () => {
  it('n’est jamais envoyé dans « Mon espace »', async () => {
    const envois = reseau();
    await api.listBillingDocuments('t');
    await api.listCaisseJournees('t');
    expect(envois.every((e) => e.headers['X-Espace'] === undefined)).toBe(true);
  });

  it('accompagne les routes de la facturation, de la comptabilité, de la banque et de la caisse', async () => {
    setEspaceActif(A);
    const envois = reseau();
    await api.listBillingDocuments('t', { type: 'facture' });
    await api.getBillingDocument('t', 'd1');
    await api.listLedgerAccounts('t');
    await api.listLedgerEntries('t');
    await api.getTrialBalance('t');
    await api.listBankAccounts('t');
    await api.listBankTransactions('t', 'b1');
    await api.listCaisseJournees('t');
    await api.recordCaisseJournee('t', JOURNEE);
    expect(envois).toHaveLength(9);
    expect(envois.every((e) => e.headers['X-Espace'] === A)).toBe(true);
    // Et le jeton reste là.
    expect(envois[0].headers.Authorization).toBe('Bearer t');
  });

  it('n’accompagne JAMAIS une route hors argent (projets, opérations, personnel, notice)', async () => {
    setEspaceActif(A);
    const envois = reseau(200, {});
    await api.listProjects('t');
    await api.getProject('t', 'p1');
    await api.listAgenda('t');
    await api.getMyApplications('t');
    await api.getProfile('t');
    await api.getBillingLegalNotice('t');
    await api.mesEspaces('t');
    expect(envois).toHaveLength(7);
    expect(envois.every((e) => e.headers['X-Espace'] === undefined)).toBe(true);
  });

  it('accompagne aussi l’export CSV de la facturation (requête hors `request`)', async () => {
    setEspaceActif(A);
    const envois = reseau(200, 'a;b');
    await api.exportBillingCsv('t');
    expect(envois[0].headers['X-Espace']).toBe(A);
  });

  it('pas sur les PDF des projets (hors argent)', async () => {
    setEspaceActif(A);
    const envois = reseau(200, 'pdf');
    await api.telechargerStatutsPdf('t', 'p1');
    expect(envois[0].headers['X-Espace']).toBeUndefined();
  });
});

describe('« Espace introuvable. » (404) : vérifier avant de rentrer chez soi', () => {
  it('demande une vérification, sans quitter l’espace de lui-même', async () => {
    const verifier = vi.fn();
    setEspaceAVerifierHandler(verifier);
    setEspaceActif(A);
    reseau(404, { message: 'Espace introuvable.', statusCode: 404 });

    await expect(api.listBillingDocuments('t')).rejects.toMatchObject({ status: 404, message: 'Espace introuvable.' });
    expect(verifier).toHaveBeenCalledWith(A);

    // C'est la relecture de GET /espaces (EspaceProvider) qui décidera :
    // en attendant, l'espace reste celui choisi.
    const envois = reseau();
    await api.listBillingDocuments('t');
    expect(envois[0].headers['X-Espace']).toBe(A);
  });

  it('l’export CSV le dit aussi', async () => {
    const verifier = vi.fn();
    setEspaceAVerifierHandler(verifier);
    setEspaceActif(A);
    reseau(404, { message: 'Espace introuvable.' });
    await expect(api.exportBillingCsv('t')).rejects.toMatchObject({ message: 'Espace introuvable.' });
    expect(verifier).toHaveBeenCalledWith(A);
  });

  it('un 403 ne demande rien et ne quitte jamais l’espace (c’est l’action qui est refusée)', async () => {
    const verifier = vi.fn();
    setEspaceAVerifierHandler(verifier);
    setEspaceActif(A);
    reseau(403, {
      message: 'Cette action ne se fait que dans ton propre espace. Reviens sur « Mon espace » pour la faire.',
    });
    await expect(api.listCaisseJournees('t')).rejects.toBeInstanceOf(ApiError);
    expect(verifier).not.toHaveBeenCalled();

    const envois = reseau();
    await api.listCaisseJournees('t');
    expect(envois[0].headers['X-Espace']).toBe(A);
  });

  it('un autre 404 dans l’espace d’un autre ne demande rien', async () => {
    const verifier = vi.fn();
    setEspaceAVerifierHandler(verifier);
    setEspaceActif(A);
    reseau(404, { message: 'Document introuvable.' });

    await expect(api.getBillingDocument('t', 'd1')).rejects.toMatchObject({ message: 'Document introuvable.' });
    expect(verifier).not.toHaveBeenCalled();
  });

  it('chez soi, le même message ne déclenche rien (aucun espace à quitter)', async () => {
    const verifier = vi.fn();
    setEspaceAVerifierHandler(verifier);
    reseau(404, { message: 'Espace introuvable.' });

    await expect(api.listBillingDocuments('t')).rejects.toBeInstanceOf(ApiError);
    expect(verifier).not.toHaveBeenCalled();
  });
});

describe('le cache hors ligne est cloisonné par espace', () => {
  it('une donnée lue dans l’espace A n’est jamais servie dans l’espace B, ni chez soi', async () => {
    setOfflineStorage(fakeStorage());
    setEspaceActif(A);
    reseau(200, [{ id: 'journee-d-alice' }]);
    await api.listCaisseJournees('t');

    horsLigne();
    setEspaceActif(B);
    await expect(api.listCaisseJournees('t')).rejects.toMatchObject({
      message: "Pas de réseau, et cette donnée n'a jamais été chargée ici.",
    });
    setEspaceActif(null);
    await expect(api.listCaisseJournees('t')).rejects.toMatchObject({
      message: "Pas de réseau, et cette donnée n'a jamais été chargée ici.",
    });

    // De retour dans A : sa propre donnée, datée.
    setEspaceActif(A);
    const erreur = await api.listCaisseJournees('t').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(OfflineReadError);
    expect((erreur as OfflineReadError).data).toEqual([{ id: 'journee-d-alice' }]);
  });

  it('une donnée de chez soi n’est pas servie dans l’espace d’un autre', async () => {
    setOfflineStorage(fakeStorage());
    reseau(200, [{ id: 'ma-journee' }]);
    await api.listCaisseJournees('t');

    horsLigne();
    setEspaceActif(A);
    const erreur = await api.listCaisseJournees('t').catch((e: unknown) => e);
    expect(erreur).not.toBeInstanceOf(OfflineReadError);
  });

  it('une route hors argent reste la même partout (c’est la mienne)', async () => {
    setOfflineStorage(fakeStorage());
    reseau(200, [{ id: 'mon-projet' }]);
    await api.listProjects('t');

    horsLigne();
    setEspaceActif(A);
    await expect(api.listProjects('t')).rejects.toBeInstanceOf(OfflineReadError);
  });

  it('la liste de mes espaces n’est jamais gardée ni servie hors ligne', async () => {
    const storage = fakeStorage();
    setOfflineStorage(storage);
    reseau(200, [{ ownerId: 'u1', nom: 'Mon espace', roles: ['proprietaire'] }]);
    await api.mesEspaces('t');
    expect(storage.entries.size).toBe(0);

    horsLigne();
    await expect(api.mesEspaces('t')).rejects.toMatchObject({ status: 0 });
  });

  it('l’accès de mon équipe à mon argent : jamais d’X-Espace, jamais gardé, jamais mis en file', async () => {
    const storage = fakeStorage();
    setOfflineStorage(storage);
    // Même placé dans l'espace d'un autre : ces routes sont les miennes.
    setEspaceActif(A);
    const envois = reseau(200, []);
    await api.accesArgent('t');
    await api.choisirAccesArgent('t', B, true);
    expect(envois.map((e) => [e.method, new URL(e.url).pathname, e.headers['X-Espace']])).toEqual([
      ['GET', '/espaces/acces-argent', undefined],
      ['PUT', `/espaces/acces-argent/${B}`, undefined],
    ]);
    expect(storage.entries.size).toBe(0);

    horsLigne();
    await expect(api.accesArgent('t')).rejects.toMatchObject({ status: 0 });
    await expect(api.choisirAccesArgent('t', B, false)).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('ne peut pas être mis de côté'),
    });
    expect(readOfflineState().pending).toEqual([]);
  });
});

describe('le cache et la file sont cloisonnés par utilisateur', () => {
  it('une donnée lue par u1 n’est jamais servie à u2, même espace, même appareil', async () => {
    setOfflineStorage(fakeStorage());
    reseau(200, [{ id: 'projet-de-u1' }]);
    await api.listProjects('t');

    horsLigne();
    setUtilisateurActif('u2');
    await expect(api.listProjects('t')).rejects.toMatchObject({
      message: "Pas de réseau, et cette donnée n'a jamais été chargée ici.",
    });

    setUtilisateurActif('u1');
    await expect(api.listProjects('t')).rejects.toBeInstanceOf(OfflineReadError);
  });

  it('cloisonné aussi dans l’espace d’un autre (clé = utilisateur + espace)', async () => {
    setOfflineStorage(fakeStorage());
    setEspaceActif(A);
    reseau(200, [{ id: 'journee-d-alice-vue-par-u1' }]);
    await api.listCaisseJournees('t');

    horsLigne();
    setUtilisateurActif('u2');
    const erreur = await api.listCaisseJournees('t').catch((e: unknown) => e);
    expect(erreur).not.toBeInstanceOf(OfflineReadError);
  });

  it('une écriture de u1 n’est ni montrée ni rejouée pour u2, et repart pour u1', async () => {
    setOfflineStorage(fakeStorage());
    horsLigne();
    await expect(api.updateProject('t', 'p1', 'Titre', 'Corps')).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(readOfflineState().pending[0]).toMatchObject({ path: '/projects/p1', utilisateur: 'u1' });

    setUtilisateurActif('u2');
    expect(readOfflineState().pending).toEqual([]);
    let envois = reseau(200, {});
    expect(await replayOfflineQueue('jeton-de-u2')).toMatchObject({ sent: 0 });
    expect(envois).toHaveLength(0);

    setUtilisateurActif('u1');
    expect(readOfflineState().pending).toHaveLength(1);
    envois = reseau(200, {});
    expect(await replayOfflineQueue('jeton-de-u1')).toMatchObject({ sent: 1 });
    expect(envois[0].headers.Authorization).toBe('Bearer jeton-de-u1');
  });

  it('sans utilisateur connu, rien n’est rejoué', async () => {
    setOfflineStorage(fakeStorage());
    horsLigne();
    await expect(api.updateProject('t', 'p1', 'Titre', 'Corps')).rejects.toBeInstanceOf(OfflineQueuedError);
    setUtilisateurActif(null);
    const envois = reseau(200, {});
    await replayOfflineQueue('t');
    expect(envois).toHaveLength(0);
  });
});

describe('écritures hors ligne d’avant ce déploiement (sans auteur)', () => {
  const ANCIENNE = JSON.stringify({
    pending: [{ id: '1-1', path: '/projects/p1', method: 'PATCH', body: '{}', label: 'Projet', queuedAt: '2026-10-01T00:00:00.000Z' }],
    rejected: [],
    nextId: 2,
  });

  it('rattachées à la première personne connectée : montrées et rejouées pour elle', async () => {
    const storage = fakeStorage();
    storage.setItem('ignitux.offline', ANCIENNE);
    setUtilisateurActif(null);
    setOfflineStorage(storage);
    setUtilisateurActif('u1');

    expect(readOfflineState().pending).toEqual([expect.objectContaining({ path: '/projects/p1', utilisateur: 'u1' })]);
    const envois = reseau(200, {});
    expect(await replayOfflineQueue('jeton-de-u1')).toMatchObject({ sent: 1 });
    expect(envois).toHaveLength(1);
  });

  it('aussi quand le stockage arrive après la session ; la personne suivante ne les voit pas', () => {
    const storage = fakeStorage();
    storage.setItem('ignitux.offline', ANCIENNE);
    setOfflineStorage(storage);
    expect(readOfflineState().pending).toHaveLength(1);

    setUtilisateurActif('u2');
    expect(readOfflineState().pending).toEqual([]);
  });
});

describe('la file d’attente se souvient de l’espace', () => {
  it('une écriture faite dans l’espace A repart avec l’en-tête de A, même rentré chez soi', async () => {
    setOfflineStorage(fakeStorage());
    setEspaceActif(A);
    horsLigne();
    await expect(api.recordCaisseJournee('t', JOURNEE)).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(readOfflineState().pending[0]).toMatchObject({ path: '/caisse/journees', espace: A });

    setEspaceActif(null);
    const envois = reseau(200, {});
    await replayOfflineQueue('t');

    expect(envois).toHaveLength(1);
    expect(envois[0].headers['X-Espace']).toBe(A);
  });

  it('une écriture faite chez soi repart sans en-tête, même depuis l’espace B', async () => {
    setOfflineStorage(fakeStorage());
    horsLigne();
    await expect(api.recordCaisseJournee('t', JOURNEE)).rejects.toBeInstanceOf(OfflineQueuedError);

    setEspaceActif(B);
    const envois = reseau(200, {});
    await replayOfflineQueue('t');

    expect(envois[0].headers['X-Espace']).toBeUndefined();
  });

  it('une écriture hors argent faite dans l’espace A ne garde pas l’espace', async () => {
    setOfflineStorage(fakeStorage());
    setEspaceActif(A);
    horsLigne();
    await expect(api.updateProject('t', 'p1', 'Titre', 'Corps')).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(readOfflineState().pending[0]).not.toHaveProperty('espace');
  });
});
