import { Module } from '@nestjs/common';
import { ConstitutionModule } from '../../constitution/constitution.module.js';
import { AutomationService } from './automation.service.js';

@Module({
  imports: [ConstitutionModule],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
