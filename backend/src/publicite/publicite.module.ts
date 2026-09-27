import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { PubliciteController } from './publicite.controller.js';
import { PubliciteService } from './publicite.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [PubliciteController],
  providers: [PubliciteService],
  exports: [PubliciteService],
})
export class PubliciteModule {}
