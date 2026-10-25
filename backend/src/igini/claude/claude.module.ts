import { Module } from '@nestjs/common';
import { CreditsModule } from '../../credits/credits.module.js';
import { AiUsageModule } from '../usage/ai-usage.module.js';
import { ClaudeService } from './claude.service.js';
import { IginiStatusController } from './igini-status.controller.js';

@Module({
  imports: [AiUsageModule, CreditsModule],
  controllers: [IginiStatusController],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
