import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { ClaudeService } from '../igini/claude/claude.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StatutsService } from './statuts.service.js';

describe('StatutsService — génération', () => {
  let service: StatutsService;
  let prisma: any;
  let claude: { generateStructuredOutput: ReturnType<typeof vi.fn> };
  let constitution: { guard: ReturnType<typeof vi.fn> };

  const dtoValide = {
    capitalCents: 100000,
    headOffice: '1 rue de la Paix, 75002 Paris',
    durationYears: 99,
    associates: [{ fullName: 'Jean Dupont', shareBasisPoints: 10000 }],
  };

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn() },
      company_bylaws: { upsert: vi.fn(), findUnique: vi.fn() },
    };
    claude = { generateStructuredOutput: vi.fn() };
    constitution = { guard: vi.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StatutsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClaudeService, useValue: claude },
        { provide: ConstitutionService, useValue: constitution },
      ],
    }).compile();
    service = moduleRef.get(StatutsService);
  });

  it('refuse si le projet n’appartient pas à l’appelant', async () => {
    prisma.projects.findFirst.mockResolvedValue(null);
    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(NotFoundException);
  });

  it('refuse pour une forme sans personne morale', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'micro-entreprise' });
    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(BadRequestException);
  });

  it('refuse si aucune forme n’est confirmée', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: null });
    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(BadRequestException);
  });

  it('refuse si la somme des parts n’est pas 100 %', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU' });
    const dtoInvalide = { ...dtoValide, associates: [{ fullName: 'A', shareBasisPoints: 5000 }] };
    await expect(service.genererPourProjet('user-1', 'p1', dtoInvalide)).rejects.toThrow(BadRequestException);
  });

  it('génère un brouillon pour une forme valide avec les parts à 100 %', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    claude.generateStructuredOutput.mockResolvedValue({ content: 'Article 1 — Forme...' });
    prisma.company_bylaws.upsert.mockResolvedValue({ id: 'b1', status: 'brouillon' });

    await service.genererPourProjet('user-1', 'p1', dtoValide);

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { userId: 'user-1', projectId: 'p1', generator: 'former' } }),
    );
    expect(prisma.company_bylaws.upsert).toHaveBeenCalledWith({
      where: { project_id: 'p1' },
      create: expect.objectContaining({
        owner_id: 'user-1',
        project_id: 'p1',
        legal_form: 'SASU',
        capital_cents: 100000,
        head_office: '1 rue de la Paix, 75002 Paris',
        duration_years: 99,
        content: 'Article 1 — Forme...',
        status: 'brouillon',
      }),
      update: expect.objectContaining({
        legal_form: 'SASU',
        capital_cents: 100000,
        content: 'Article 1 — Forme...',
        status: 'brouillon',
      }),
    });
  });

  it('refuse des parts qui dépassent 100 % cumulées sur plusieurs associés', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SARL' });
    const dtoInvalide = {
      ...dtoValide,
      associates: [
        { fullName: 'A', shareBasisPoints: 6000 },
        { fullName: 'B', shareBasisPoints: 5000 },
      ],
    };
    await expect(service.genererPourProjet('user-1', 'p1', dtoInvalide)).rejects.toThrow(BadRequestException);
  });
});
