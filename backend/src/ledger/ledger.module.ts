import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';

/**
 * LedgerModule tient la COMPTABILITE (plan de comptes, journal, balance),
 * avec la separation stricte entre les livres d'IGNITUX et ceux de chaque
 * personne.
 *
 * A ne pas confondre avec FinancingModule (src/financing/), qui suit les
 * tours de financement et la repartition du capital d'UN projet, ni avec
 * src/igini/financing/, qui est le generateur IA de plan de financement.
 * Trois choses differentes, trois modules.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
