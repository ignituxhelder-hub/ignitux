import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { ConstitutionModule } from '../../constitution/constitution.module.js';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';

@Module({
  // Voir ProjectsModule pour l'explication de ce couple d'imports : AuthModule
  // garantit que JwtStrategy est instanciée, PassportModule.register résout
  // la dépendance interne de JwtAuthGuard.
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
