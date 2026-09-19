import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service.js';
import { IginiStatusController } from './igini-status.controller.js';

@Module({
  controllers: [IginiStatusController],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
