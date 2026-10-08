import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../roles/roles.service.js';
import { IdentiteService, typeImage } from './identite.service.js';

vi.mock('./ocr-extraction.js', () => ({ extraireTexte: vi.fn() }));

// Les octets bruts des pièces ne doivent jamais sortir dans une réponse JSON
// de liste/création : seul lireDocument y donne accès, une face à la fois.
const SANS_OCTETS = { document_front: true, document_back: true };

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
      providers: [
        IdentiteService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: { holdsRole: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(IdentiteService);
  });

  it('crée une vérification en_attente avec les octets fournis', async () => {
    const front = Buffer.from('recto');
    const back = Buffer.from('verso');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await service.soumettreDocument('user-1', 'carte_identite', front, back, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      omit: SANS_OCTETS,
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
      omit: SANS_OCTETS,
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
      omit: SANS_OCTETS,
      data: expect.objectContaining({ name_matches_account: null }),
    });
  });

  it('stocke le résultat de la validation MRZ', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      omit: SANS_OCTETS,
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
      omit: SANS_OCTETS,
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
      omit: SANS_OCTETS,
      data: expect.objectContaining({
        status: 'rejetee',
        rejection_reason: 'Document expiré.',
      }),
    });
  });

  it('ne rejette pas un document dont la MRZ indique une expiration future (régression siècle)', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    // Même ligne officielle ICAO, expiration modifiée en '360101'
    // (1er janvier 2036). Couvre la régression où l'heuristique de siècle
    // sans buffer de pivot lisait yy=36 comme 1936 et rejetait à tort ce
    // document pourtant valide bien au-delà d'aujourd'hui — le seul
    // contrôle de cette méthode qui court-circuite la revue humaine.
    vi.mocked(extraireTexte).mockResolvedValue('L898902C36UTO7408122F3601017ZE184226B<<<<<10');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      omit: SANS_OCTETS,
      data: expect.objectContaining({
        status: 'en_attente',
        rejection_reason: null,
        extracted_expiry_date: new Date(Date.UTC(2036, 0, 1)),
      }),
    });
  });

  it('laisse un document non expiré en_attente', async () => {
    const { extraireTexte } = await import('./ocr-extraction.js');
    vi.mocked(extraireTexte).mockResolvedValue('AUCUNE MRZ ICI');
    prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

    await service.soumettreDocument('user-1', 'passeport', Buffer.from('page'), null, null);

    expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
      omit: SANS_OCTETS,
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
        omit: SANS_OCTETS,
        data: expect.objectContaining({ name_matches_account: true }),
      });
    });

    it('transmet null quand le profil n’a pas de display_name (ou n’existe pas)', async () => {
      prisma.user_profiles.findUnique.mockResolvedValue(null);
      prisma.identity_verifications.create.mockResolvedValue({ id: 'v1' });

      await service.soumettreDocumentPourUtilisateur('user-1', 'passeport', Buffer.from('page'), null);

      expect(prisma.identity_verifications.create).toHaveBeenCalledWith({
        omit: SANS_OCTETS,
        data: expect.objectContaining({ name_matches_account: null }),
      });
    });
  });
});

describe('IdentiteService — revue', () => {
  let service: IdentiteService;
  let prisma: {
    identity_verifications: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let roles: { holdsRole: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      identity_verifications: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    };
    roles = { holdsRole: vi.fn().mockResolvedValue(false) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdentiteService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
      ],
    }).compile();
    service = moduleRef.get(IdentiteService);
  });

  it('valide une vérification en_attente et trace l’administrateur qui a tranché', async () => {
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'en_attente' });
    prisma.identity_verifications.update.mockResolvedValue({ id: 'v1', status: 'validee' });

    await service.revoirVerification('admin-1', 'v1', 'validee');

    expect(prisma.identity_verifications.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: expect.objectContaining({
        status: 'validee',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(Date),
      }),
      omit: SANS_OCTETS,
    });
  });

  it('trace aussi l’administrateur sur un rejet', async () => {
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'en_attente' });
    prisma.identity_verifications.update.mockResolvedValue({ id: 'v1', status: 'rejetee' });

    await service.revoirVerification('admin-1', 'v1', 'rejetee', 'photo illisible');

    expect(prisma.identity_verifications.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'rejetee',
          rejection_reason: 'photo illisible',
          reviewed_by: 'admin-1',
        }),
      }),
    );
  });

  it('ne relit pas les octets des pièces pour trancher', async () => {
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'en_attente' });
    prisma.identity_verifications.update.mockResolvedValue({ id: 'v1', status: 'validee' });

    await service.revoirVerification('admin-1', 'v1', 'validee');

    expect(prisma.identity_verifications.findFirst).toHaveBeenCalledWith({
      where: { id: 'v1' },
      select: { id: true, status: true },
    });
  });

  it('refuse de revoir une vérification déjà tranchée', async () => {
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'validee' });

    await expect(service.revoirVerification('admin-1', 'v1', 'rejetee', 'doublon')).rejects.toThrow(
      /déjà/i,
    );
  });

  it('exige un motif pour un rejet', async () => {
    prisma.identity_verifications.findFirst.mockResolvedValue({ id: 'v1', status: 'en_attente' });

    await expect(service.revoirVerification('admin-1', 'v1', 'rejetee')).rejects.toThrow(/motif/i);
  });

  describe('listerEnAttente', () => {
    function ligne(id: string, extra: Record<string, unknown> = {}) {
      return {
        id,
        document_type: 'passeport',
        status: 'en_attente',
        created_at: new Date('2026-09-30T00:00:00.000Z'),
        extracted_document_number: null,
        extracted_birth_date: null,
        extracted_expiry_date: null,
        mrz_checksum_valid: null,
        name_matches_account: null,
        owner: { email: `${id}@exemple.fr`, profile: { display_name: `Nom ${id}` } },
        ...extra,
      };
    }

    it('ne sélectionne jamais les octets des pièces et joint l’identité du déposant', async () => {
      prisma.identity_verifications.findMany.mockResolvedValue([]);

      await service.listerEnAttente();

      const appelListe = prisma.identity_verifications.findMany.mock.calls[0][0];
      expect(appelListe.where).toEqual({ status: 'en_attente' });
      expect(appelListe.orderBy).toEqual({ created_at: 'asc' });
      expect(appelListe.select).toEqual(
        expect.objectContaining({
          extracted_document_number: true,
          extracted_birth_date: true,
          extracted_expiry_date: true,
          mrz_checksum_valid: true,
          name_matches_account: true,
          owner: { select: { email: true, profile: { select: { display_name: true } } } },
        }),
      );
      expect(appelListe.select.document_front).toBeUndefined();
      expect(appelListe.select.document_back).toBeUndefined();
    });

    it('aplatit le déposant et indique la présence d’un verso', async () => {
      prisma.identity_verifications.findMany
        .mockResolvedValueOnce([
          ligne('v1'),
          ligne('v2', { owner: { email: 'v2@exemple.fr', profile: null } }),
        ])
        .mockResolvedValueOnce([{ id: 'v1' }]);

      const resultat = await service.listerEnAttente();

      // Deuxième requête : seulement les identifiants qui ont un verso,
      // sans jamais lire les octets eux-mêmes.
      expect(prisma.identity_verifications.findMany).toHaveBeenCalledWith({
        where: { status: 'en_attente', document_back: { not: null } },
        select: { id: true },
      });
      expect(resultat[0]).toEqual(
        expect.objectContaining({
          id: 'v1',
          a_un_verso: true,
          owner: { email: 'v1@exemple.fr', display_name: 'Nom v1' },
        }),
      );
      expect(resultat[1]).toEqual(
        expect.objectContaining({
          id: 'v2',
          a_un_verso: false,
          owner: { email: 'v2@exemple.fr', display_name: null },
        }),
      );
    });

    it('place les dossiers signalés en tête, en gardant l’ordre chronologique dans chaque groupe', async () => {
      prisma.identity_verifications.findMany
        .mockResolvedValueOnce([
          ligne('ancien-ok'),
          ligne('ancien-mrz-ko', { mrz_checksum_valid: false }),
          ligne('recent-ok', { mrz_checksum_valid: true, name_matches_account: true }),
          ligne('recent-nom-ko', { name_matches_account: false }),
        ])
        .mockResolvedValueOnce([]);

      const resultat = await service.listerEnAttente();

      expect(resultat.map((v) => v.id)).toEqual([
        'ancien-mrz-ko',
        'recent-nom-ko',
        'ancien-ok',
        'recent-ok',
      ]);
    });
  });

  describe('lireDocument', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

    it('rend le recto au propriétaire avec le type PNG détecté', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({
        owner_id: 'user-1',
        document_front: new Uint8Array(PNG),
      });

      const doc = await service.lireDocument('user-1', 'v1', 'front');

      expect(prisma.identity_verifications.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1' },
        select: { owner_id: true, document_front: true },
      });
      expect(doc.type).toBe('image/png');
      expect(Buffer.from(doc.contenu).equals(PNG)).toBe(true);
      // Le propriétaire n'a pas besoin d'être administrateur.
      expect(roles.holdsRole).not.toHaveBeenCalled();
    });

    it('ne lit que la colonne du verso quand on demande le verso, et détecte le JPEG', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({
        owner_id: 'user-1',
        document_back: new Uint8Array(JPEG),
      });

      const doc = await service.lireDocument('user-1', 'v1', 'back');

      expect(prisma.identity_verifications.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1' },
        select: { owner_id: true, document_back: true },
      });
      expect(doc.type).toBe('image/jpeg');
    });

    it('rend le document à un administrateur qui n’en est pas propriétaire', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({
        owner_id: 'user-1',
        document_front: new Uint8Array(JPEG),
      });
      roles.holdsRole.mockResolvedValue(true);

      const doc = await service.lireDocument('admin-1', 'v1', 'front');

      expect(roles.holdsRole).toHaveBeenCalledWith('admin-1', 'administrateur');
      expect(doc.type).toBe('image/jpeg');
    });

    it('refuse (404) un tiers ni propriétaire ni administrateur', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({
        owner_id: 'user-1',
        document_front: new Uint8Array(JPEG),
      });
      roles.holdsRole.mockResolvedValue(false);

      await expect(service.lireDocument('intrus', 'v1', 'front')).rejects.toThrow(NotFoundException);
      expect(roles.holdsRole).toHaveBeenCalledWith('intrus', 'administrateur');
    });

    it('404 quand la vérification n’existe pas', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue(null);

      await expect(service.lireDocument('user-1', 'v1', 'front')).rejects.toThrow(NotFoundException);
    });

    it('404 quand la face demandée est absente (passeport sans verso)', async () => {
      prisma.identity_verifications.findFirst.mockResolvedValue({ owner_id: 'user-1', document_back: null });

      await expect(service.lireDocument('user-1', 'v1', 'back')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('typeImage', () => {
  it('reconnaît PNG et JPEG, et retombe sur un type binaire neutre sinon', () => {
    expect(typeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(typeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(typeImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('application/octet-stream');
    expect(typeImage(new Uint8Array([]))).toBe('application/octet-stream');
  });
});
