import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getEnv } from './config/env.js';

// Valide la configuration avant de démarrer quoi que ce soit : un .env
// invalide ou incomplet doit échouer immédiatement avec un message clair,
// pas plus tard par un crash Prisma ou JWT obscur.
const env = getEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  await app.listen(env.PORT);
}
await bootstrap();
