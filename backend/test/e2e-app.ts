import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

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
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
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

  const signup = await api(app).post('/users/signup').send({ email, password }).expect(201);
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
