import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { AnalysisModule } from '../igini/analysis/analysis.module.js';
import { AutomationModule } from '../igini/automation/automation.module.js';
import { MemoryModule } from '../igini/memory/memory.module.js';
import { DevelopmentModule } from '../igini/development/development.module.js';
import { FinancingModule } from '../igini/financing/financing.module.js';
import { PlanningModule } from '../igini/planning/planning.module.js';
import { TransmissionModule } from '../igini/transmission/transmission.module.js';
import { WorkflowModule } from '../igini/workflow/workflow.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  // AuthModule est importé explicitement pour garantir que JwtStrategy (qui
  // enregistre la stratégie 'jwt' auprès de Passport) est bien instanciée,
  // plutôt que de compter sur le fait qu'AppModule charge les deux modules.
  // PassportModule.register reste nécessaire pour la résolution DI de
  // JwtAuthGuard (option AuthModuleOptions).
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AnalysisModule,
    PlanningModule,
    FinancingModule,
    DevelopmentModule,
    TransmissionModule,
    WorkflowModule,
    AutomationModule,
    ConstitutionModule,
    MemoryModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
