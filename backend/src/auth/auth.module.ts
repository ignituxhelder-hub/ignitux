import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getEnv } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // registerAsync (plutôt que register) pour que getEnv() ne s'exécute
    // qu'à l'instanciation réelle du module par Nest, pas au simple import
    // du fichier — sinon un fichier de test import ant AuthModule sans même
    // le démarrer ferait planter le process si le .env n'est pas chargé.
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnv();
        return {
          secret: env.JWT_SECRET,
          signOptions: { expiresIn: env.JWT_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}` },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
