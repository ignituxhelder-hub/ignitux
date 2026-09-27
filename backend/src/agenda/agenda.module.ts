import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
