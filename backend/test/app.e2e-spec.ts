import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  // Le type venait de 'supertest/types', un sous-chemin que le paquet
  // n'exporte pas : l'import ne résolvait pas et faisait échouer `tsc` en
  // permanence, ce qui privait le projet de sa vérification de types.
  // Server (node:http) est ce que Nest expose réellement ici.
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
