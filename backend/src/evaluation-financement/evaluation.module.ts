import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { FinanceAuditModule } from '../finance-audit/finance-audit.module.js';
import { ClaudeModule } from '../igini/claude/claude.module.js';
import { OffresModule } from '../offres/offres.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { RoleGuard } from '../roles/role.guard.js';
import { RolesModule } from '../roles/roles.module.js';
import { EvaluationRevueService } from './evaluation-revue.service.js';
import { EvaluationController, EvaluationRevueController } from './evaluation.controller.js';
import { EvaluationService } from './evaluation.service.js';

@Module({
  // JwtAuthGuard a besoin de AuthModule + PassportModule, RoleGuard de
  // RolesModule — comme IdentiteModule. Sans eux, l'application refuse de
  // démarrer, et les tests unitaires ne le voient pas.
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RolesModule,
    ClaudeModule,
    OffresModule,
    ProjectsModule,
    FinanceAuditModule,
    ComplianceModule,
  ],
  controllers: [EvaluationController, EvaluationRevueController],
  providers: [EvaluationService, EvaluationRevueService, RoleGuard],
})
export class EvaluationModule {}
