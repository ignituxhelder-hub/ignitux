import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { IdentiteController } from './identite.controller.js';
import { IdentiteService } from './identite.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [IdentiteController],
  providers: [IdentiteService],
  exports: [IdentiteService],
})
export class IdentiteModule {}
