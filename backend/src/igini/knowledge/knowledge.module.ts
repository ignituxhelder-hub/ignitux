import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AutomationModule } from '../automation/automation.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AutomationModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
