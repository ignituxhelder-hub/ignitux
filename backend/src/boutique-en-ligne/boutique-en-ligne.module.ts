import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { BoutiqueEnLigneCallbackController } from './boutique-en-ligne-callback.controller.js';
import { BoutiqueEnLigneController } from './boutique-en-ligne.controller.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [BoutiqueEnLigneController, BoutiqueEnLigneCallbackController],
  providers: [BoutiqueEnLigneService],
})
export class BoutiqueEnLigneModule {}
