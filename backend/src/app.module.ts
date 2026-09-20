import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { ConstitutionModule } from './constitution/constitution.module.js';
import { CrmModule } from './crm/crm.module.js';
import { BankingModule } from './banking/banking.module.js';
import { FinancingModule } from './financing/financing.module.js';
import { FinanceAuditModule } from './finance-audit/finance-audit.module.js';
import { InvestorsModule } from './investors/investors.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { CommunityModule } from './community/community.module.js';
import { KnowledgeModule } from './igini/knowledge/knowledge.module.js';
import { MemoryModule } from './igini/memory/memory.module.js';
import { ScoringModule } from './igini/scoring/scoring.module.js';
import { WorkflowModule } from './igini/workflow/workflow.module.js';
import { MarketplaceModule } from './marketplace/marketplace.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Limite globale par défaut : 20 requêtes / minute / IP.
    // Les endpoints sensibles (login, signup) ont une limite plus stricte
    // posée directement sur leur route via @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    MemoryModule,
    KnowledgeModule,
    WorkflowModule,
    ScoringModule,
    CommunityModule,
    ComplianceModule,
    ConstitutionModule,
    CrmModule,
    BillingModule,
    FinancingModule,
    LedgerModule,
    BankingModule,
    InvestorsModule,
    FinanceAuditModule,
    MarketplaceModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}