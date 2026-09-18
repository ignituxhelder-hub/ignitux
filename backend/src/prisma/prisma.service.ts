import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}