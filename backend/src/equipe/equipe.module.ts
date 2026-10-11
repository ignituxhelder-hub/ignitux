import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { EquipeController } from './equipe.controller.js';
import { EquipeService } from './equipe.service.js';

@Module({
  // JwtAuthGuard a besoin de AuthModule + PassportModule (voir ExecutionModule).
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), MailModule],
  controllers: [EquipeController],
  providers: [EquipeService],
})
export class EquipeModule {}
