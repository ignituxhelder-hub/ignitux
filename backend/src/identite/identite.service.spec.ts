import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdentiteService } from './identite.service.js';

vi.mock('./ocr-extraction.js', () => ({ extraireTexte: vi.fn() }));

describe('IdentiteService — soumission de document', () => {
  let service: IdentiteService;
  let prisma: {
    identity_verifications: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    user_profiles: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      identity_verifications: { create: vi.fn(), findMany: vi.fn() },
      user_profiles: { findUnique: vi.fn() },
    };
    // Valeur par défaut réaliste (une vraie extraction OCR ne rend jamais
    // `undefined`) : sans ceci, les tests qui ne configurent pas
    // explicitement `extraireTexte` planteraient sur
    // `extraireChampsStructures(undefined)` depuis que soumettreDocument en
    // dépend (Task 4) — `mockReset()` d'abord pour qu'aucun test n'hérite
    // d'une configuration laissée par le précédent.
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockReset().mockResolvedValue('');
    const moduleRef = await Test.createTestingModule({
      providers: [IdentiteService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(IdentiteService);
  });

  it('crée une vérification en_attente avec les octets fournis', async () => {
    const front = Buffer.from('recto');
    const back = Buffer.from('verso');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await service.soumettreDocument('user-1', 'carte_identite', front, back, null);

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
      service.soumettreDocument('user-1', 'carte_identite', Buffer.from('recto'), null, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un passeport sans verso', async () => {
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });
    await expect(
      service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null),
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

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(extraireTexte).toHaveBeenCalledWith(Buffer.from('page'));
  });

  it('marque name_matches_account à null quand le compte n’a pas de nom affiché', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('texte sans nom exploitable');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name_matches_account: null }),
    });
  });

  it('stocke le résultat de la validation MRZ', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mrz_checksum_valid: null,
        extracted_document_number: null,
        extracted_birth_date: null,
        extracted_expiry_date: null,
      }),
    });
  });

  it('stocke le numéro de document et les dates extraits de la MRZ', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    // Même ligne officielle ICAO utilisée dans champs-extraits.spec.ts :
    // numéro 'L898902C3', naissance 12/08/1974, expiration 15/04/2012.
    vi.mocked(extraireTexte).mockResolvedValue('L898902C36UTO7408122F1204159ZE184226B<<<<<10');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extracted_document_number: 'L898902C3',
        extracted_birth_date: new Date(Date.UTC(1974, 7, 12)),
        extracted_expiry_date: new Date(Date.UTC(2012, 3, 15)),
      }),
    });
  });

  it('rejette automatiquement un document dont la date d’expiration MRZ est passée', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    // Même ligne MRZ officielle ICAO utilisée dans champs-extraits.spec.ts :
    // expiration 12/04/2012, largement passée à la date où ce test tourne.
    vi.mocked(extraireTexte).mockResolvedValue('L898902C36UTO7408122F1204159ZE184226B<<<<<10');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'rejetee',
        rejection_reason: 'Document expiré.',
      }),
    });
  });

  it('laisse un document non expiré en_attente', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'en_attente', rejection_reason: null }),
    });
  });

  describe('soumettreDocumentPourUtilisateur', () => {
    it('résout le display_name du profil et le transmet à soumettreDocument', async () => {
      prisma.user_profiles.findUnique.mockResolvedValue({ display_name: 'Jean Dupont' });
      prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });
      const { extraireTexte } = await import('./ocr-extraction.js');
      vi.mocked(extraireTexte).mockResolvedValue('IDENTITE JEAN DUPONT FRANCE');

      await service.soumettreDocumentPourUtilisateur('user-1', 'passeport', Buffer.from('page'), null);

      expect(prisma.user_profiles.findUnique).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        select: { display_name: true },
      });
      expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name_matches_account: true }),
      });
    });

    it('transmet null quand le profil n’a pas de display_name (ou n’existe pas)', async () => {
      prisma.user_profiles.findUnique.mockResolvedValue(null);
      prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

      await service.soumettreDocumentPourUtilisateur('user-1', 'passeport', Buffer.from('page'), null);

      expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name_matches_account: null }),
      });
    });
  });
});
