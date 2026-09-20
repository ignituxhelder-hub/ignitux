import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { ReadinessController } from './readiness.controller.js';
import { ReadinessService } from './readiness.service.js';

/**
 * Ce qui permet de savoir, depuis l'extérieur, si ce serveur va bien.
 *
 * Le filtre d'exception n'est pas déclaré ici mais posé globalement dans
 * `main.ts` : un filtre fourni par un module ne couvre pas les erreurs
 * levées avant que l'injection de dépendances n'ait abouti, ce qui est
 * précisément le moment où l'on a le plus besoin de lui.
 */
@Module({
  imports: [MailModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ObservabilityModule {}
