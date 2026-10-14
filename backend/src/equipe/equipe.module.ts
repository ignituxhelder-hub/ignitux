import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { EquipeController } from './equipe.controller.js';
import { EquipeService } from './equipe.service.js';
import { EspaceInterceptor } from './espace.interceptor.js';
import { EspaceService } from './espace.service.js';
import { EspacesController } from './espaces.controller.js';

/**
 * Global : `@Espace('argent')` instancie `ResoudreEspacePipe` dans le module
 * de chaque contrôleur d'argent, et ce pipe a besoin d'`EspaceService`.
 * Rendre ce module global évite de l'importer dans chacun.
 *
 * L'intercepteur des espaces (fermé par défaut, journal d'activité) est
 * enregistré ici, pour toute l'application.
 */
@Global()
@Module({
  // JwtAuthGuard a besoin de AuthModule + PassportModule (voir ExecutionModule).
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), MailModule],
  controllers: [EquipeController, EspacesController],
  providers: [EquipeService, EspaceService, { provide: APP_INTERCEPTOR, useClass: EspaceInterceptor }],
  exports: [EspaceService],
})
export class EquipeModule {}
