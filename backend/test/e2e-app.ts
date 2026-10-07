import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { TurnstileVerificationService } from '../src/users/turnstile-verification.service.js';

/**
 * Démarre l'application complète, configurée **exactement** comme en
 * production.
 *
 * Le détail qui compte : `ValidationPipe` est reproduit à l'identique
 * depuis `main.ts`. Sans lui, aucun DTO ne serait validé pendant les
 * tests — un test qui envoie un corps invalide passerait, et on croirait
 * avoir vérifié une protection qui n'existe pas au moment où elle sert.
 */
export async function startApp(): Promise<INestApplication<Server>> {
  // Le contrôle anti-robot est simulé, jamais appelé pour de vrai. Chaque
  // inscription interrogeait sinon le serveur de Cloudflare (5 s de patience,
  // refus s'il ne répond pas) : avec des dizaines de comptes par exécution,
  // une seule lenteur réseau faisait tomber une suite entière, et la CI
  // devenait rouge sans que le produit y soit pour rien. Le vrai service garde
  // ses propres tests (turnstile-verification.service.spec.ts, users.controller.spec.ts) ;
  // aucun test de bout en bout n'éprouve son refus.
  //
  // Le simulacre refuse encore un jeton vide, pour que « sans jeton » reste un échec.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TurnstileVerificationService)
    .useValue({ verify: (token: string) => Promise.resolve(token.trim().length > 0) })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  // Le serveur écoute UNE fois pour toute la suite, sur un port libre choisi par
  // le système. Sans cela, supertest en ouvre un nouveau — sur un autre port —
  // à chaque requête, puis le ferme. Node 24 réutilise par défaut les
  // connexions déjà ouvertes (keep-alive) : une connexion restée ouverte vers
  // un ancien port tombait parfois sur un serveur plus récent et était coupée
  // (ECONNRESET, « Connection reset by peer »), au hasard, en CI. `app.close()`,
  // appelé par chaque suite, ferme ce serveur.
  await app.listen(0);
  return app;
}

export function api(app: INestApplication<Server>) {
  return request(app.getHttpServer());
}

/**
 * Un compte jetable, avec son jeton.
 *
 * Les adresses portent le suffixe `.e2e.test` et un horodatage : deux
 * exécutions simultanées ne se marchent pas dessus, et une ligne oubliée
 * se repère au premier coup d'œil.
 */
export interface TestAccount {
  email: string;
  password: string;
  token: string;
  userId: string;
}

let sequence = 0;

export async function createAccount(app: INestApplication<Server>): Promise<TestAccount> {
  sequence += 1;
  const email = `e2e.${Date.now()}.${sequence}@e2e.test`;
  // Un mot de passe DIFFÉRENT par compte. Un mot de passe partagé rendrait
  // muet tout test du genre « avec le mot de passe de quelqu'un d'autre » :
  // il serait le bon, et le test passerait sans rien vérifier.
  const password = `MotDePasse-E2E-${sequence}-${Date.now()}`;

  // Le contrôle anti-robot est simulé (voir startApp) : « jeton-e2e » n'a besoin
  // d'être qu'une chaîne non vide.
  const signup = await api(app)
    .post('/users/signup')
    .send({ email, password, captchaToken: 'jeton-e2e' })
    .expect(201);
  const login = await api(app).post('/auth/login').send({ email, password }).expect(200);

  return {
    email,
    password,
    token: login.body.accessToken as string,
    userId: signup.body.id as string,
  };
}

/**
 * Supprime le compte et, par cascade, tout ce qu'il a créé.
 *
 * On passe par la route de suppression du produit plutôt que par des
 * `DELETE` en base : si elle cesse de tout nettoyer, les tests suivants
 * trouveront des restes, et c'est exactement le signal qu'on veut. Un
 * nettoyage qui court-circuite le produit masquerait ses fuites.
 */
export async function deleteAccount(
  app: INestApplication<Server>,
  account: TestAccount,
): Promise<void> {
  await api(app)
    .delete('/users/me')
    .set('Authorization', `Bearer ${account.token}`)
    .send({ password: account.password })
    .expect(204);
}

export function auth(account: TestAccount): [string, string] {
  return ['Authorization', `Bearer ${account.token}`];
}
