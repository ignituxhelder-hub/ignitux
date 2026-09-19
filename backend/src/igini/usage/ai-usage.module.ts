import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { AiUsageController } from './ai-usage.controller.js';
import { AiUsageService } from './ai-usage.service.js';

/**
 * Le journal des couts IA. PrismaModule est @Global, il n'a pas a etre
 * importe ; AuthModule l'est parce que la seule route exposee est
 * authentifiee, et qu'elle ne rend que les chiffres de la personne connectee.
 */
@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AiUsageController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
