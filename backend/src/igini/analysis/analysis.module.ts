import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { AnalysisService } from './analysis.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
