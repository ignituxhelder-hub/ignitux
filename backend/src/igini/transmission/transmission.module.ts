import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { TransmissionService } from './transmission.service.js';

@Module({
  imports: [ClaudeModule],
  providers: [TransmissionService],
  exports: [TransmissionService],
})
export class TransmissionModule {}
