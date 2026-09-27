import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ImmobilierController } from './immobilier.controller.js';
import { ImmobilierService } from './immobilier.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ImmobilierController],
  providers: [ImmobilierService],
  exports: [ImmobilierService],
})
export class ImmobilierModule {}
