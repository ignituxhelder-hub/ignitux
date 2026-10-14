import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { QuestionnerService } from './questionner.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [QuestionnerService],
  exports: [QuestionnerService],
})
export class QuestionnerModule {}
