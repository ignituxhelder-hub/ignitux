import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { FinancedProjectsController, InvestorsController } from './investors.controller.js';
import { InvestorsService } from './investors.service.js';

/**
 * Le moteur d'investissement : investisseurs, projets finances,
 * participations, repartitions.
 *
 * A ne pas confondre avec FinancingModule (src/financing/), qui suit le
 * capital et les apports d'UN projet, ni avec src/ledger/, qui tient la
 * comptabilite. Celui-ci repond a une question qu'aucun des deux ne posait :
 * qu'a mis CETTE personne, dans TOUS ses projets, et que lui est-il revenu ?
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule],
  controllers: [InvestorsController, FinancedProjectsController],
  providers: [InvestorsService],
  exports: [InvestorsService],
})
export class InvestorsModule {}
