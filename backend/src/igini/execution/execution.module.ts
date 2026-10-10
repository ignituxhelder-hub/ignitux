import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { AutomationModule } from '../automation/automation.module.js';
import { ComplianceModule } from '../../compliance/compliance.module.js';
import { ClaudeModule } from '../claude/claude.module.js';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';

@Module({
  // JwtAuthGuard a besoin de AuthModule + PassportModule, comme ChatModule et
  // MemoryModule. Sans eux, l'application refuse de démarrer — les tests
  // unitaires ne le voient pas, car ils remplacent le garde.
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ClaudeModule,
    AutomationModule,
    ComplianceModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
