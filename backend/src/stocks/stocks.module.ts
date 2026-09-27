import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [StocksController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
