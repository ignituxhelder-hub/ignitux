import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Ferme proprement la connexion à la base quand le process s'arrête
  // (SIGTERM/SIGINT) — nécessite app.enableShutdownHooks() dans main.ts.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}