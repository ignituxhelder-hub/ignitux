import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
