import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { ConstitutionModule } from '../constitution/constitution.module.js';
import { ClaudeModule } from '../igini/claude/claude.module.js';
import { StatutsController } from './statuts.controller.js';
import { StatutsService } from './statuts.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule, ClaudeModule],
  controllers: [StatutsController],
  providers: [StatutsService],
  exports: [StatutsService],
})
export class StatutsModule {}
