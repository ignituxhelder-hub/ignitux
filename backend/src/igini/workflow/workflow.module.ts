import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module.js';
import { ConstitutionModule } from '../../constitution/constitution.module.js';
import { WorkflowEngineController } from './workflow-engine.controller.js';
import { WorkflowEngineService } from './workflow-engine.service.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' }), ConstitutionModule],
  controllers: [WorkflowController, WorkflowEngineController],
  providers: [WorkflowService, WorkflowEngineService],
  exports: [WorkflowService, WorkflowEngineService],
})
export class WorkflowModule {}
