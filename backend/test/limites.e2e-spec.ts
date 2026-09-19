import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { api, auth, createAccount, deleteAccount, startApp, type TestAccount } from './e2e-app.js';

/**
 * LES LIMITES DE DÉBIT, ÉPROUVÉES POUR DE VRAI.
 *
 * Un `@Throttle` mal placé — sur la mauvaise méthode, au-dessus du
 * mauvais décorateur — ne produit aucune erreur : il ne fait
 * simplement rien. Aucun test unitaire ne s'en apercevrait, puisqu'ils
 * appellent le contrôleur directement et court-circuitent les gardes.
 * Seule une vraie requête HTTP répétée le montre.
 */
describe('limites de débit (e2e)', () => {
  let app: INestApplication<Server>;
  let account: TestAccount;

  beforeAll(async () => {
    app = await startApp();
    account = await createAccount(app);
  });

  afterAll(async () => {
    await deleteAccount(app, account);
    await app.close();
  });

  it("l'export de données est limité à 3 par minute", async () => {
    // C'est l'endpoint le plus coûteux du produit : une trentaine de
    // requêtes en base par appel. Sans limite propre, la limite globale
    // de 20/min en autoriserait plusieurs centaines depuis une seule
    // adresse.
    const codes: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api(app)
        .get('/users/me/export')
        .set(...auth(account));
      codes.push(response.status);
    }

    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3)).toEqual([429, 429]);
  });

  it("l'inscription est limitée, pour ne pas laisser créer des comptes en rafale", async () => {
    // Les corps envoyés sont volontairement invalides (mot de passe trop
    // court) : le limiteur est un garde, et Nest exécute les gardes AVANT
    // la validation. On éprouve donc la limite sans créer un seul compte.
    //
    // La première version de ce test envoyait de vrais corps valides et
    // laissait quatre comptes derrière elle — exactement ce que le
    // principe de nettoyage de cette suite interdit. Les supprimer aurait
    // demandé autant de connexions, elles-mêmes limitées : le test se
    // serait mordu la queue.
    const codes: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await api(app)
        .post('/users/signup')
        .send({ email: `rafale.${attempt}@e2e.test`, password: 'court' });
      codes.push(response.status);
    }

    // On n'affirme pas à quel essai exactement la limite mord : le compte
    // monté en `beforeAll` a déjà consommé un jeton sur cette route, et
    // ancrer le test sur ce détail le rendrait cassant. Ce qui compte est
    // la forme : la limite finit par mordre, et une fois mordue elle ne
    // relâche pas dans la même minute.
    const premier429 = codes.indexOf(429);

    expect(premier429).toBeGreaterThan(0);
    expect(premier429).toBeLessThanOrEqual(5);
    expect(codes.slice(0, premier429).every((code) => code === 400)).toBe(true);
    expect(codes.slice(premier429).every((code) => code === 429)).toBe(true);
  });

  it('une lecture ordinaire reste largement disponible', async () => {
    // Sinon le test précédent passerait pour une mauvaise raison : il
    // suffirait que tout soit bloqué.
    const response = await api(app)
      .get('/projects')
      .set(...auth(account));

    expect(response.status).toBe(200);
  });
});
