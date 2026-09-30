import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { FormerService } from './former.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [FormerService],
  exports: [FormerService],
})
export class FormerModule {}
