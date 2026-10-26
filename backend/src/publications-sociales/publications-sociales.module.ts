import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ClaudeModule } from '../igini/claude/claude.module.js';
import { PublicationsSocialesController } from './publications-sociales.controller.js';
import { PublicationsSocialesService } from './publications-sociales.service.js';

@Module({
  imports: [
    AuthModule,
    ClaudeModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [PublicationsSocialesController],
  providers: [PublicationsSocialesService],
})
export class PublicationsSocialesModule {}
