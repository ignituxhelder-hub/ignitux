import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { PlanningService } from './planning.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
