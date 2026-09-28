import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { ProjectsModule } from '../../projects/projects.module.js';
import { ClaudeModule } from '../claude/claude.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { IginiToolsService } from './igini-tools.service.js';

@Module({
  // Voir MemoryModule pour l'explication de ce couple AuthModule/PassportModule.
  // ProjectsModule et MemoryModule fournissent ProjectsService/MemoryService
  // à IginiToolsService, sans dupliquer leur logique.
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ClaudeModule,
    ProjectsModule,
    MemoryModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, IginiToolsService],
})
export class ChatModule {}
