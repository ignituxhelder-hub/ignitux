import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { FinancingService } from './financing.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [FinancingService],
  exports: [FinancingService],
})
export class FinancingModule {}
