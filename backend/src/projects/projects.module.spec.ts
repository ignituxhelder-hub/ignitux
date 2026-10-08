import 'reflect-metadata';
import { ProjectsModule } from './projects.module.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsModule', () => {
  it('exporte ProjectsService, pour que ChatModule puisse l’injecter', () => {
    const exports = Reflect.getMetadata('exports', ProjectsModule) ?? [];
    expect(exports).toContain(ProjectsService);
  });
});
