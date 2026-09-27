import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CaisseController } from './caisse.controller.js';
import { CaisseService } from './caisse.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), LedgerModule],
  controllers: [CaisseController],
  providers: [CaisseService],
  exports: [CaisseService],
})
export class CaisseModule {}
