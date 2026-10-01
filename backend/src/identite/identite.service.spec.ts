import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdentiteService } from './identite.service.js';

vi.mock('./ocr-extraction.js', () => ({ extraireTexte: vi.fn() }));

describe('IdentiteService — soumission de document', () => {
  let service: IdentiteService;
  let prisma: {
    identity_verifications: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      identity_verifications: { create: vi.fn(), findMany: vi.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [IdentiteService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(IdentiteService);
  });

  it('crée une vérification en_attente avec les octets fournis', async () => {
    const front = Buffer.from('recto');
    const back = Buffer.from('verso');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await service.soumettreDocument('user-1', 'carte_identite', front, back);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner_id: 'user-1',
        document_type: 'carte_identite',
        document_front: expect.any(Uint8Array),
        document_back: expect.any(Uint8Array),
        status: 'en_attente',
      }),
    });
  });

  it('refuse une carte d’identité sans verso', async () => {
    await expect(
      service.soumettreDocument('user-1', 'carte_identite', Buffer.from('recto'), null),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un passeport sans verso', async () => {
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });
    await expect(
      service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null),
    ).resolves.toBeDefined();
  });

  it('liste les vérifications du propriétaire, plus récentes en premier', async () => {
    prisma.identity_verifications.findMany.mockResolvedValue([]);
    await service.listerMesVerifications('user-1');
    expect(prisma.identity_verifications.findMany).toHaveBeenCalledWith({
      where: { owner_id: 'user-1' },
      orderBy: { created_at: 'desc' },
    });
  });

  it('lance l’extraction OCR sur le recto avant la création', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('texte simulé');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null);

    expect(extraireTexte).toHaveBeenCalledWith(Buffer.from('page'));
  });
});
