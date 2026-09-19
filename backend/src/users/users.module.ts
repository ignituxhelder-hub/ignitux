import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthTokensModule } from '../auth-tokens/auth-tokens.module.js';
import { UserDataService } from './user-data.service.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  // PassportModule : les routes /users/me/* sont protégées par JwtAuthGuard.
  // AuthModule n'est pas importé ici — il importe déjà UsersModule, et le
  // cycle ferait échouer le démarrage de Nest.
  imports: [AuthTokensModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [UsersService, UserDataService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
