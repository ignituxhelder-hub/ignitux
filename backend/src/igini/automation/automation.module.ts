import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service.js';

@Module({
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
