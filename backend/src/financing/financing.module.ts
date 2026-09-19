import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { FinancingController } from './financing.controller.js';
import { FinancingService } from './financing.service.js';

/**
 * Nommé FinancingModule et placé dans src/financing/, à ne pas confondre
 * avec src/igini/financing/ qui est le GÉNÉRATEUR IA de plan de
 * financement. Celui-ci suit l'argent réel ; l'autre rédige un plan.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [FinancingController],
  providers: [FinancingService],
  exports: [FinancingService],
})
export class FinancingModule {}
