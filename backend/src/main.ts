import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { getEnv } from './config/env.js';

// Valide la configuration avant de démarrer quoi que ce soit : un .env
// invalide ou incomplet doit échouer immédiatement avec un message clair,
// pas plus tard par un crash Prisma ou JWT obscur.
const env = getEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  // Nécessaire pour que PrismaService.onModuleDestroy() (déconnexion propre
  // de la base) soit appelé sur SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ignitux API')
    .setDescription("API d'Ignitux : comptes, projets, et les 5 générateurs IA d'IGINI.")
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(env.PORT);
}
await bootstrap();
