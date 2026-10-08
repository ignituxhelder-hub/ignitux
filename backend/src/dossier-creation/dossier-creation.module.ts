import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { DossierCreationController } from './dossier-creation.controller.js';
import { DossierCreationService } from './dossier-creation.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [DossierCreationController],
  providers: [DossierCreationService],
})
export class DossierCreationModule {}
