import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionController } from './constitution.controller.js';
import { ConstitutionService } from './constitution.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ConstitutionController],
  providers: [ConstitutionService],
  exports: [ConstitutionService],
})
export class ConstitutionModule {}
