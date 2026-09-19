import { Module } from '@nestjs/common';
import { AuthTokensModule } from '../auth-tokens/auth-tokens.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [AuthTokensModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
