import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * UNE ÉCRITURE FAITE HORS LIGNE PEUT-ELLE ENCORE EFFACER DU TRAVAIL ?
 *
 * Le scénario, en clair : quelqu'un modifie un projet sur son téléphone, sans
 * réseau. L'écriture part en file d'attente. Depuis son ordinateur, il modifie
 * le même projet. Le téléphone retrouve le réseau, la file rejoue — et la
 * modification la plus ancienne écrase la plus récente, sans que rien ne le
 * signale.
 *
 * C'était le dernier trou connu du dispositif hors ligne, et le seul capable
 * de faire disparaître du travail en silence. Les tests unitaires du garde
 * vérifient sa décision ; ceux-ci vérifient qu'elle arrive bien jusqu'à la
 * route, en passant par l'authentification, le pipe de validation et le
 * filtre d'erreurs — c'est-à-dire là où un garde mal monté ne se voit pas.
 */
describe('écritures revenues du froid (e2e)', () => {
  let app: INestApplication<Server>;
  let porteur: TestAccount;
  let projectId: string;

  beforeAll(async () => {
    app = await startApp();
    porteur = await createAccount(app);
  });

  afterAll(async () => {
    await deleteAccount(app, porteur);
    await app.close();
  });

  beforeEach(async () => {
    const project = await api(app)
      .post('/projects')
      .set(...auth(porteur))
      .send({ title: 'Projet à deux appareils', description: 'Version initiale.' })
      .expect(201);
    projectId = project.body.id as string;

    // Le projet vient d'être créé, donc sa date de dernière modification est
    // « maintenant ». Un test qui simulerait une capture faite « il y a deux
    // secondes » se heurterait alors à sa propre création, et mesurerait le
    // temps que met le test à s'exécuter plutôt que le comportement du garde.
    //
    // On le vieillit d'une demi-heure. Les durées ci-dessous sont dès lors
    // exactes plutôt que probables.
    await app.get(PrismaService).projects.update({
      where: { id: projectId },
      data: { updated_at: new Date(Date.now() - 30 * 60_000) },
    });
  });

  // L'offre gratuite n'autorise qu'un seul projet : sans ce ménage, le
  // deuxième test se heurterait à un 402 au lieu de tester ce qu'il annonce.
  // Suppression sans en-tête — c'est du rangement, pas une écriture rejouée.
  afterEach(async () => {
    await api(app)
      .delete(`/projects/${projectId}`)
      .set(...auth(porteur));
  });

  it('refuse la modification hors ligne quand le projet a changé depuis', async () => {
    // L'ordinateur, en ligne : il modifie maintenant.
    await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .send({ title: 'Écrit depuis l’ordinateur', description: 'La version à garder.' })
      .expect(200);

    // Le téléphone rejoue une écriture capturée une heure plus tôt.
    const refus = await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .set('X-Ignitux-Capture-Age', String(60 * 60_000))
      .send({ title: 'Écrit hors ligne', description: 'La version périmée.' })
      .expect(409);

    expect(refus.body.message).toContain('hors ligne');

    // Et surtout : la version récente est intacte. C'est le seul fait qui
    // compte vraiment ici — le code de retour n'est qu'une façon de le dire.
    const apres = await api(app)
      .get(`/projects/${projectId}`)
      .set(...auth(porteur))
      .expect(200);
    expect(apres.body.title).toBe('Écrit depuis l’ordinateur');
  });

  it('refuse aussi la suppression : détruire est irréversible', async () => {
    await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .send({ title: 'Travail plus récent', description: 'À ne pas perdre.' })
      .expect(200);

    await api(app)
      .delete(`/projects/${projectId}`)
      .set(...auth(porteur))
      .set('X-Ignitux-Capture-Age', String(60 * 60_000))
      .expect(409);

    await api(app)
      .get(`/projects/${projectId}`)
      .set(...auth(porteur))
      .expect(200);
  });

  it('accepte la modification hors ligne quand rien n’a bougé', async () => {
    // Le cas ordinaire, et de loin le plus fréquent : personne n'a touché au
    // projet pendant la coupure. Le projet a été modifié il y a trente
    // minutes, la capture date de dix : elle est postérieure, elle passe.
    //
    // Si ce test tombe, le dispositif bloque du travail légitime — ce qui
    // serait pire que le trou qu'il bouche.
    await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .set('X-Ignitux-Capture-Age', String(10 * 60_000))
      .send({ title: 'Écrit hors ligne', description: 'Personne d’autre n’a touché.' })
      .expect(200);

    const apres = await api(app)
      .get(`/projects/${projectId}`)
      .set(...auth(porteur))
      .expect(200);
    expect(apres.body.title).toBe('Écrit hors ligne');
  });

  it('ne change rien pour une écriture envoyée sans en-tête', async () => {
    await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .send({ title: 'Première', description: 'a' })
      .expect(200);

    // Même situation que le premier test, mais sans l'en-tête : c'est une
    // écriture en ligne ordinaire, et elle doit passer comme avant.
    await api(app)
      .patch(`/projects/${projectId}`)
      .set(...auth(porteur))
      .send({ title: 'Seconde', description: 'b' })
      .expect(200);
  });

  it('ne répond pas 409 à quelqu’un qui n’est pas connecté', async () => {
    // Sans cette garantie, l'écart entre 401 et 409 dirait à n'importe qui si
    // un identifiant existe. Le garde est monté APRÈS l'authentification
    // précisément pour ça, et ce test tient ce montage.
    await api(app)
      .patch(`/projects/${projectId}`)
      .set('X-Ignitux-Capture-Age', String(60 * 60_000))
      .send({ title: 'Sans jeton', description: 'x' })
      .expect(401);
  });

  it('ne se prononce pas sur un projet qui n’existe pas : le 404 reste un 404', async () => {
    await api(app)
      .patch('/projects/00000000-0000-4000-8000-000000000000')
      .set(...auth(porteur))
      .set('X-Ignitux-Capture-Age', String(60 * 60_000))
      .send({ title: 'Fantôme', description: 'y' })
      .expect(404);
  });
});
