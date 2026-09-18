import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, ProjectsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}