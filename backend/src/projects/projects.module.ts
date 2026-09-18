import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PlanningModule } from '../planning/planning.module.js';
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
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
