import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
      company_bylaws: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bylaw_associates: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // Transaction interactive simulée : le callback reçoit le même client.
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    claude = { generateStructuredOutput: vi.fn().mockResolvedValue({ content: 'texte généré' }) };
    prisma.company_bylaws.findFirst.mockResolvedValue(null);
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
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('refuse pour une forme sans personne morale', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'micro-entreprise' });
    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(BadRequestException);
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('refuse si aucune forme n’est confirmée', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: null });
    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(BadRequestException);
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('refuse si la somme des parts n’est pas 100 %', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU' });
    const dtoInvalide = { ...dtoValide, associates: [{ fullName: 'A', shareBasisPoints: 5000 }] };
    await expect(service.genererPourProjet('user-1', 'p1', dtoInvalide)).rejects.toThrow(BadRequestException);
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('crée un brouillon quand aucune ligne n’existe encore', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    claude.generateStructuredOutput.mockResolvedValue({ content: 'Article 1 — Forme...' });
    prisma.company_bylaws.findUnique.mockResolvedValue(null);
    prisma.company_bylaws.create.mockResolvedValue({ id: 'b1', status: 'brouillon', associates: [] });

    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).resolves.toMatchObject({ id: 'b1' });

    expect(claude.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { userId: 'user-1', projectId: 'p1', generator: 'former' } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.company_bylaws.create).toHaveBeenCalledWith({
      include: { associates: true },
      data: expect.objectContaining({
        owner_id: 'user-1',
        project_id: 'p1',
        legal_form: 'SASU',
        capital_cents: 100000,
        head_office: '1 rue de la Paix, 75002 Paris',
        duration_years: 99,
        content: 'Article 1 — Forme...',
        status: 'brouillon',
        associates: { create: [{ full_name: 'Jean Dupont', share_basis_points: 10000 }] },
      }),
    });
    expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
  });

  it('rend une ConflictException si une autre requête a créé la ligne entre-temps (P2002)', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    prisma.company_bylaws.findUnique.mockResolvedValue(null);
    prisma.company_bylaws.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(ConflictException);
  });

  it('remplace un brouillon existant par une écriture gardée sur le statut brouillon', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    claude.generateStructuredOutput.mockResolvedValue({ content: 'Nouveau texte' });
    prisma.company_bylaws.findUnique
      .mockResolvedValueOnce({ id: 'b1' })
      .mockResolvedValueOnce({ id: 'b1', content: 'Nouveau texte', associates: [{ full_name: 'Jean Dupont' }] });

    const resultat = await service.genererPourProjet('user-1', 'p1', dtoValide);

    expect(prisma.company_bylaws.updateMany).toHaveBeenCalledWith({
      where: { project_id: 'p1', status: 'brouillon' },
      data: expect.objectContaining({ content: 'Nouveau texte', status: 'brouillon', capital_cents: 100000 }),
    });
    expect(prisma.bylaw_associates.deleteMany).toHaveBeenCalledWith({ where: { bylaws_id: 'b1' } });
    expect(prisma.bylaw_associates.createMany).toHaveBeenCalledWith({
      data: [{ bylaws_id: 'b1', full_name: 'Jean Dupont', share_basis_points: 10000 }],
    });
    expect(prisma.company_bylaws.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'b1' },
      include: { associates: true },
    });
    expect(resultat).toMatchObject({ content: 'Nouveau texte', associates: [{ full_name: 'Jean Dupont' }] });
  });

  it('n’écrase jamais une ligne devenue retenue pendant l’appel Claude', async () => {
    // Le pré-contrôle voit un brouillon, puis quelqu'un retient pendant les
    // dizaines de secondes de génération : l'écriture gardée ne touche rien.
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    prisma.company_bylaws.findFirst.mockResolvedValue({ status: 'brouillon' });
    prisma.company_bylaws.findUnique.mockResolvedValue({ id: 'b1' });
    prisma.company_bylaws.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(ConflictException);

    expect(claude.generateStructuredOutput).toHaveBeenCalledTimes(1);
    expect(prisma.bylaw_associates.deleteMany).not.toHaveBeenCalled();
    expect(prisma.bylaw_associates.createMany).not.toHaveBeenCalled();
    expect(prisma.company_bylaws.create).not.toHaveBeenCalled();
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
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it('refuse de générer si une version retenue existe déjà, sans appeler Claude ni écraser', async () => {
    prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
    prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'retenue' });
    claude.generateStructuredOutput.mockResolvedValue({ content: 'Texte qui ne doit jamais être écrit' });

    await expect(service.genererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(ConflictException);

    expect(prisma.company_bylaws.findFirst).toHaveBeenCalledWith({ where: { project_id: 'p1' }, select: { status: true } });
    expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
    expect(prisma.company_bylaws.create).not.toHaveBeenCalled();
  });

  describe('édition et régénération', () => {
    it('modifie le texte tant que le statut est brouillon, par une écriture gardée', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'brouillon' });
      prisma.company_bylaws.findUnique.mockResolvedValue({ id: 'b1', content: 'nouveau texte', associates: [] });

      await expect(service.modifierTexte('user-1', 'p1', 'nouveau texte')).resolves.toMatchObject({
        content: 'nouveau texte',
      });

      expect(prisma.company_bylaws.findFirst).toHaveBeenCalledWith({ where: { project_id: 'p1', owner_id: 'user-1' } });
      expect(prisma.company_bylaws.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: 'brouillon' },
        data: { content: 'nouveau texte' },
      });
      expect(prisma.company_bylaws.findUnique).toHaveBeenCalledWith({
        where: { id: 'b1' },
        include: { associates: true },
      });
    });

    it('refuse de modifier une version retenue', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'retenue' });
      await expect(service.modifierTexte('user-1', 'p1', 'x')).rejects.toThrow(ConflictException);
      expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
    });

    it('refuse de modifier si la version a été retenue entre la lecture et l’écriture', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'brouillon' });
      prisma.company_bylaws.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.modifierTexte('user-1', 'p1', 'x')).rejects.toThrow(ConflictException);
      expect(prisma.company_bylaws.findUnique).not.toHaveBeenCalled();
    });

    it('refuse de modifier des statuts introuvables pour ce propriétaire', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(null);
      await expect(service.modifierTexte('user-1', 'p1', 'x')).rejects.toThrow(NotFoundException);
    });

    it('refuse de régénérer une version retenue, sans appeler Claude', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'retenue' });
      await expect(service.regenererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(/retenue/i);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
      expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
    });

    it('régénère un brouillon via une nouvelle génération Claude', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'brouillon' });
      prisma.projects.findFirst.mockResolvedValue({ id: 'p1', owner_id: 'user-1', confirmed_legal_form: 'SASU', title: 'Mon projet' });
      claude.generateStructuredOutput.mockResolvedValue({ content: 'Nouveau texte' });
      prisma.company_bylaws.findUnique.mockResolvedValue({ id: 'b1', status: 'brouillon', associates: [] });

      await service.regenererPourProjet('user-1', 'p1', dtoValide);

      expect(claude.generateStructuredOutput).toHaveBeenCalledTimes(1);
      expect(prisma.company_bylaws.updateMany).toHaveBeenCalledTimes(1);
    });

    it('refuse de régénérer des statuts inexistants', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(null);
      await expect(service.regenererPourProjet('user-1', 'p1', dtoValide)).rejects.toThrow(NotFoundException);
      expect(claude.generateStructuredOutput).not.toHaveBeenCalled();
    });
  });

  describe('retenir et lister', () => {
    it('retient une version brouillon, par une écriture gardée', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'brouillon' });
      prisma.company_bylaws.findUnique.mockResolvedValue({ id: 'b1', status: 'retenue', associates: [] });

      await expect(service.retenirPourProjet('user-1', 'p1')).resolves.toMatchObject({ status: 'retenue' });

      expect(prisma.company_bylaws.findFirst).toHaveBeenCalledWith({ where: { project_id: 'p1', owner_id: 'user-1' } });
      expect(prisma.company_bylaws.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: { not: 'retenue' } },
        data: { status: 'retenue', finalized_at: expect.any(Date) },
      });
      expect(prisma.company_bylaws.findUnique).toHaveBeenCalledWith({
        where: { id: 'b1' },
        include: { associates: true },
      });
    });

    it('refuse de retenir une version déjà retenue, sans rien écrire', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'retenue' });
      await expect(service.retenirPourProjet('user-1', 'p1')).rejects.toThrow(ConflictException);
      expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
    });

    it('refuse de retenir si une autre requête a retenu entre la lecture et l’écriture', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', status: 'brouillon' });
      prisma.company_bylaws.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.retenirPourProjet('user-1', 'p1')).rejects.toThrow(ConflictException);
      expect(prisma.company_bylaws.findUnique).not.toHaveBeenCalled();
    });

    it('refuse de retenir des statuts introuvables pour ce propriétaire', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(null);
      await expect(service.retenirPourProjet('user-1', 'p1')).rejects.toThrow(NotFoundException);
      expect(prisma.company_bylaws.updateMany).not.toHaveBeenCalled();
    });

    it('rend null quand aucun statut n’existe pour le projet', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(null);
      await expect(service.obtenirPourProjet('user-1', 'p1')).resolves.toBeNull();
    });

    it('rend la ligne existante avec ses associés, limitée au propriétaire', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ id: 'b1', associates: [] });
      await expect(service.obtenirPourProjet('user-1', 'p1')).resolves.toEqual({ id: 'b1', associates: [] });
      expect(prisma.company_bylaws.findFirst).toHaveBeenCalledWith({
        where: { project_id: 'p1', owner_id: 'user-1' },
        include: { associates: true },
      });
    });
  });
});
