import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { DevelopmentService } from './development.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [DevelopmentService],
  exports: [DevelopmentService],
})
export class DevelopmentModule {}
