import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ImmatriculationController } from './immatriculation.controller.js';
import { ImmatriculationService } from './immatriculation.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), LedgerModule],
  controllers: [ImmatriculationController],
  providers: [ImmatriculationService],
})
export class ImmatriculationModule {}
