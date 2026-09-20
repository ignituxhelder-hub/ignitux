import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { getEnv } from './config/env.js';
import { parseTrustProxy, shouldServeApiDocs } from './config/production-preflight.js';
import { UnexpectedErrorFilter } from './observability/error.filter.js';

// Valide la configuration avant de démarrer quoi que ce soit : un .env
// invalide ou incomplet doit échouer immédiatement avec un message clair,
// pas plus tard par un crash Prisma ou JWT obscur.
const env = getEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Derrière un reverse proxy, `req.ip` vaut l'adresse du proxy tant qu'on
  // ne lui dit pas combien de sauts croire. Le limiteur de débit clé sur
  // `req.ip` : sans ce réglage, les mille personnes derrière le proxy
  // partagent un seul seau, et la première qui s'agite verrouille les
  // autres. Le nombre est explicite plutôt que `true` : `true` fait
  // confiance à toute la chaîne, ce qui laisse un client écrire lui-même
  // son `X-Forwarded-For` et disparaître du comptage.
  const proxys = parseTrustProxy(env.TRUST_PROXY);
  app.set('trust proxy', proxys === null ? false : proxys);

  app.use(helmet());
  app.enableCors({
    origin: env.FRONTEND_URL,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Posé ici et non fourni par un module : un filtre injecté ne couvre pas
  // les erreurs levées avant que l'injection de dépendances n'ait abouti,
  // c'est-à-dire au moment où l'on en a le plus besoin.
  app.useGlobalFilters(new UnexpectedErrorFilter());

  // Nécessaire pour que PrismaService.onModuleDestroy() (déconnexion propre
  // de la base) soit appelé sur SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // Une promesse rejetée sans `catch` tue le processus Node par défaut
  // depuis la v15. On la journalise avant de laisser le processus tomber :
  // redémarrer sans savoir pourquoi est la pire des deux issues, et taire
  // l'erreur pour survivre laisserait le serveur dans un état inconnu.
  process.on('unhandledRejection', (raison) => {
    // eslint-disable-next-line no-console
    console.error('Promesse rejetée sans traitement — le processus va s’arrêter :', raison);
  });

  // /docs décrit toute la surface de l'API. En production on ne la sert
  // que sur demande explicite : la sécurité ne tient pas au secret des
  // routes, mais rien n'oblige à fournir le plan.
  if (shouldServeApiDocs(process.env)) {
    servirLaDocumentation(app);
  }

  await app.listen(env.PORT);
}

function servirLaDocumentation(app: NestExpressApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ignitux API')
    .setDescription("API d'Ignitux : comptes, projets, et les 5 générateurs IA d'IGINI.")
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);
}
await bootstrap();
