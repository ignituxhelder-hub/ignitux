import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { InvestorsModule } from '../investors/investors.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { FinanceAuditController } from './finance-audit.controller.js';
import { FinanceAuditService } from './finance-audit.service.js';

/**
 * L'audit financier : il ne tient aucune donnee, il relit celles des autres.
 *
 * Il depend du grand livre et du moteur d'investissement pour reutiliser
 * leurs controles de separation plutot que de les reecrire — deux
 * implementations du meme controle finiraient par diverger, et c'est la
 * mauvaise qui rassurerait.
 */
@Module({
  imports: [
    AuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    LedgerModule,
    InvestorsModule,
  ],
  controllers: [FinanceAuditController],
  providers: [FinanceAuditService],
  exports: [FinanceAuditService],
})
export class FinanceAuditModule {}
