/** Les droits de l'équipe sur les documents juridiques : lecture partagée, actes au propriétaire. */
import { ForbiddenException } from '@nestjs/common';
import { DossierCreationService } from '../dossier-creation/dossier-creation.service.js';
import { MandatsService } from '../identite/mandats.service.js';
import { ImmatriculationService } from '../immatriculation/immatriculation.service.js';
import { StatutsService } from '../statuts/statuts.service.js';

const projetAvec = (role: string) => ({ id: 'p1', owner_id: 'proprio', title: 'Idée', collaborators: [{ role }] });

function prismaPour(role: string) {
  return {
    projects: { findFirst: vi.fn().mockResolvedValue(projetAvec(role)) },
    company_bylaws: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('droits de l’équipe — statuts', () => {
  const statuts = (role: string) => {
    const prisma = prismaPour(role);
    return { prisma, service: new StatutsService(prisma as never, {} as never, { guard: vi.fn() } as never) };
  };

  it('un comptable lit les statuts du propriétaire', async () => {
    const { service, prisma } = statuts('comptable');

    await service.obtenirPourProjet('u2', 'p1');

    expect(prisma.company_bylaws.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { project_id: 'p1', owner_id: 'proprio' } }),
    );
  });

  it('un salarié ne voit pas les documents juridiques', async () => {
    await expect(statuts('salarie').service.obtenirPourProjet('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un associé ne génère ni ne retient les statuts : ce sont des actes du propriétaire', async () => {
    const { service } = statuts('associe');
    await expect(service.genererPourProjet('u2', 'p1', {} as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.retenirPourProjet('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('droits de l’équipe — dossier, immatriculation, mandats', () => {
  it('un associé ne marque pas le dossier comme déposé', async () => {
    const service = new DossierCreationService(prismaPour('associe') as never);
    await expect(service.marquerDepose('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un salarié ne lit pas le dossier de création', async () => {
    const service = new DossierCreationService(prismaPour('salarie') as never);
    await expect(service.obtenir('u2', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un associé n’enregistre pas l’immatriculation', async () => {
    const service = new ImmatriculationService(prismaPour('associe') as never, {} as never);
    await expect(service.enregistrer('u2', 'p1', {} as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un associé ne crée pas de mandat au nom du projet', async () => {
    const service = new MandatsService(prismaPour('associe') as never);
    await expect(service.creerMandat('u2', 'p1', 'Déposer le dossier')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
