import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module.js';
import { ComplianceModule } from '../../compliance/compliance.module.js';
import { ClaudeModule } from '../claude/claude.module.js';
import { ExecutionService } from './execution.service.js';

@Module({
  imports: [ClaudeModule, AutomationModule, ComplianceModule],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
