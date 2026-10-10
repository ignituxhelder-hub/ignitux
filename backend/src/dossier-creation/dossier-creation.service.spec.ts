import { inflateSync } from 'node:zlib';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { DossierCreationService } from './dossier-creation.service.js';

/** Octets WinAnsi (hex) des chaînes écrites par pdfkit (même lecture que dossier-pdf.spec). */
function octetsTexte(b: Buffer): string {
  let out = '';
  for (const m of b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const texte = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      out += [...texte.matchAll(/<([0-9a-f]+)>/g)].map((x) => x[1]).join('');
    } catch {
      // flux non Flate : ignoré
    }
  }
  return out;
}
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex');

describe('DossierCreationService', () => {
  let service: DossierCreationService;
  let prisma: any;

  const projet = (confirmed_legal_form: string | null = 'SASU') => ({ id: 'p1', title: 'Mon projet', confirmed_legal_form });

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue(projet()) },
      company_bylaws: { findFirst: vi.fn().mockResolvedValue(null) },
      identity_verifications: { findMany: vi.fn().mockResolvedValue([]) },
      mandates: { findFirst: vi.fn().mockResolvedValue(null) },
      creation_filings: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      company_registrations: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DossierCreationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DossierCreationService);
  });

  describe('vérification du propriétaire', () => {
    it('cherche le projet filtré sur le propriétaire', async () => {
      await service.obtenir('user-1', 'p1');
      expect(prisma.projects.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', owner_id: 'user-1' } }),
      );
    });

    // Un collaborateur n'est pas propriétaire : même requête, même 404.
    it.each([
      ['obtenir', (s: DossierCreationService) => s.obtenir('autre', 'p1')],
      ['cocher', (s: DossierCreationService) => s.cocher('autre', 'p1', [])],
      ['marquerDepose', (s: DossierCreationService) => s.marquerDepose('autre', 'p1')],
      ['rouvrir', (s: DossierCreationService) => s.rouvrir('autre', 'p1')],
      ['recapitulatifPdf', (s: DossierCreationService) => s.recapitulatifPdf('autre', 'p1')],
    ])('%s : 404 pour un non-propriétaire, sans rien lire ni écrire d’autre', async (_nom, appel) => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(appel(service)).rejects.toThrow(NotFoundException);
      expect(prisma.company_bylaws.findFirst).not.toHaveBeenCalled();
      expect(prisma.identity_verifications.findMany).not.toHaveBeenCalled();
      expect(prisma.creation_filings.upsert).not.toHaveBeenCalled();
      expect(prisma.creation_filings.updateMany).not.toHaveBeenCalled();
      expect(prisma.company_registrations.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('obtenir', () => {
    it('rend forme, pièces, étapes, frais et un dépôt en préparation quand rien n’existe', async () => {
      const dossier = await service.obtenir('user-1', 'p1');
      expect(dossier.forme).toBe('SASU');
      expect(dossier.pieces.map((p) => p.id)).toContain('capital_depose');
      expect(dossier.etapes.map((e) => e.id)).toEqual(['statuts', 'capital', 'annonce', 'depot', 'kbis']);
      expect(dossier.frais.miseAJour).toBe('octobre 2026');
      expect(dossier.filing).toEqual({ status: 'preparation', checkedItems: [], depositedAt: null, filingReference: null });
    });

    it('sans fiche d’immatriculation : non immatriculée, registration null', async () => {
      const dossier = await service.obtenir('user-1', 'p1');
      expect(dossier.immatriculee).toBe(false);
      expect(dossier.registration).toBeNull();
    });

    it('avec une fiche : immatriculée, SIREN et date rendus, filing.status inchangé', async () => {
      prisma.company_registrations.findFirst.mockResolvedValue({ siren: '443061841', registered_on: new Date('2026-10-01T00:00:00Z') });
      prisma.creation_filings.findFirst.mockResolvedValue({
        status: 'preparation',
        checked_items: [],
        deposited_at: null,
        filing_reference: null,
      });
      const dossier = await service.obtenir('user-1', 'p1');
      expect(prisma.company_registrations.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { project_id: 'p1', owner_id: 'user-1' } }),
      );
      expect(dossier.immatriculee).toBe(true);
      expect(dossier.registration).toEqual({ siren: '443061841', registeredOn: '2026-10-01' });
      expect(dossier.filing.status).toBe('preparation');
    });

    it('forme non confirmée : pas d’erreur, une seule pièce, aucune étape', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet(null));
      const dossier = await service.obtenir('user-1', 'p1');
      expect(dossier.forme).toBeNull();
      expect(dossier.pieces).toEqual([expect.objectContaining({ id: 'forme_confirmee', etat: 'a_faire' })]);
      expect(dossier.etapes).toEqual([]);
    });

    it('lit le statut d’identité sans jamais charger les images de la pièce', async () => {
      prisma.identity_verifications.findMany.mockResolvedValue([{ status: 'validee' }]);
      const dossier = await service.obtenir('user-1', 'p1');
      expect(prisma.identity_verifications.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { owner_id: 'user-1' }, select: { status: true } }),
      );
      expect(dossier.pieces.find((p) => p.id === 'identite')?.etat).toBe('pret');
    });

    it('statuts retenus, mandat signé et cases cochées se reflètent dans les pièces', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ status: 'retenue', associates: [] });
      prisma.mandates.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.creation_filings.findFirst.mockResolvedValue({
        status: 'depose',
        checked_items: ['capital_depose'],
        deposited_at: new Date('2026-10-08T10:00:00Z'),
        filing_reference: 'REF-1',
      });
      const dossier = await service.obtenir('user-1', 'p1');
      const etats = Object.fromEntries(dossier.pieces.map((p) => [p.id, p.etat]));
      expect(etats).toMatchObject({ statuts: 'pret', mandat: 'pret', capital_depose: 'pret', justificatif_siege: 'a_faire' });
      expect(dossier.filing).toEqual({
        status: 'depose',
        checkedItems: ['capital_depose'],
        depositedAt: new Date('2026-10-08T10:00:00Z'),
        filingReference: 'REF-1',
      });
      expect(prisma.mandates.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project_id: 'p1', owner_id: 'user-1', status: 'active', signed_at: { not: null } },
        }),
      );
    });

    it('statuts retenus pour une autre forme que la forme confirmée : à faire, formes nommées', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet('SAS'));
      prisma.company_bylaws.findFirst.mockResolvedValue({ status: 'retenue', legal_form: 'SASU', associates: [] });
      const statuts = (await service.obtenir('user-1', 'p1')).pieces.find((p) => p.id === 'statuts');
      expect(statuts?.etat).toBe('a_faire');
      expect(statuts?.detail).toContain('écrits pour une SASU');
      expect(statuts?.detail).toContain('ta forme confirmée est SAS');
    });

    it('statuts retenus pour la forme confirmée : prêts', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ status: 'retenue', legal_form: 'SASU', associates: [] });
      const statuts = (await service.obtenir('user-1', 'p1')).pieces.find((p) => p.id === 'statuts');
      expect(statuts?.etat).toBe('pret');
    });

    it('après un changement de forme, ne renvoie que les cases encore cochables', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet('micro-entreprise'));
      prisma.creation_filings.findFirst.mockResolvedValue({
        status: 'preparation',
        checked_items: ['capital_depose', 'justificatif_siege', 'declaration_beneficiaires'],
        deposited_at: null,
        filing_reference: null,
      });
      const dossier = await service.obtenir('user-1', 'p1');
      expect(dossier.filing.checkedItems).toEqual(['justificatif_siege']);
    });
  });

  describe('changement de forme SAS → micro-entreprise avec des cases restantes', () => {
    beforeEach(() => {
      prisma.projects.findFirst.mockResolvedValue(projet('micro-entreprise'));
      prisma.creation_filings.findFirst.mockResolvedValue({
        status: 'preparation',
        checked_items: ['capital_depose'],
        deposited_at: null,
        filing_reference: null,
      });
    });

    it('les cases ne sont pas verrouillées : cocher à partir de la liste renvoyée passe', async () => {
      const { filing } = await service.obtenir('user-1', 'p1');
      expect(filing.checkedItems).toEqual([]);
      await expect(service.cocher('user-1', 'p1', [...filing.checkedItems, 'justificatif_siege'])).resolves.toBeDefined();
      // L'écriture remplace la liste : la case restante disparaît de la base.
      expect(prisma.creation_filings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { checked_items: ['justificatif_siege'] } }),
      );
    });

    it('le PDF ne reprend ni la section Société ni des statuts restants', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({
        status: 'retenue',
        legal_form: 'SAS',
        head_office: 'Adresse-restante',
        capital_cents: 100000,
        associates: [{ full_name: 'Associe-restant', share_basis_points: 10000 }],
      });
      const texte = octetsTexte(await service.recapitulatifPdf('user-1', 'p1'));
      expect(texte).toContain(hex('Forme juridique'));
      expect(texte).not.toContain(hex('Adresse-restante'));
      expect(texte).not.toContain(hex('Associe-restant'));
      expect(texte).not.toContain(hex('Pas encore de statuts'));
    });
  });

  describe('cocher', () => {
    it('enregistre les pièces cochées (upsert sur le projet)', async () => {
      await service.cocher('user-1', 'p1', ['justificatif_siege', 'capital_depose']);
      expect(prisma.creation_filings.upsert).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        create: { owner_id: 'user-1', project_id: 'p1', checked_items: ['justificatif_siege', 'capital_depose'] },
        update: { checked_items: ['justificatif_siege', 'capital_depose'] },
      });
    });

    it('accepte un tableau vide', async () => {
      await expect(service.cocher('user-1', 'p1', [])).resolves.toBeDefined();
      expect(prisma.creation_filings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { checked_items: [] } }));
    });

    it('400 pour un id inconnu', async () => {
      await expect(service.cocher('user-1', 'p1', ['statuts'])).rejects.toThrow(BadRequestException);
      expect(prisma.creation_filings.upsert).not.toHaveBeenCalled();
    });

    it('400 pour des doublons', async () => {
      await expect(service.cocher('user-1', 'p1', ['capital_depose', 'capital_depose'])).rejects.toThrow(BadRequestException);
      expect(prisma.creation_filings.upsert).not.toHaveBeenCalled();
    });

    it('400 pour une pièce non concernée par la forme (capital d’une micro-entreprise)', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet('micro-entreprise'));
      await expect(service.cocher('user-1', 'p1', ['capital_depose'])).rejects.toThrow(BadRequestException);
      await expect(service.cocher('user-1', 'p1', ['justificatif_siege'])).resolves.toBeDefined();
    });

    it('une création concurrente de la ligne (P2002) : réessaie une fois, et l’écriture passe', async () => {
      const unique = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.creation_filings.upsert.mockRejectedValueOnce(unique).mockResolvedValueOnce({});
      await expect(service.cocher('user-1', 'p1', ['justificatif_siege'])).resolves.toBeDefined();
      expect(prisma.creation_filings.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.creation_filings.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ update: { checked_items: ['justificatif_siege'] } }),
      );
    });

    it('409 seulement si le second essai viole encore l’unicité', async () => {
      prisma.creation_filings.upsert.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.cocher('user-1', 'p1', [])).rejects.toThrow(ConflictException);
      expect(prisma.creation_filings.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('marquerDepose', () => {
    it('crée la ligne au besoin puis écrit en gardant sur le statut preparation', async () => {
      await service.marquerDepose('user-1', 'p1', '  J-2026-001  ');
      expect(prisma.creation_filings.upsert).toHaveBeenCalledWith({
        where: { project_id: 'p1' },
        create: { owner_id: 'user-1', project_id: 'p1' },
        update: {},
      });
      expect(prisma.creation_filings.updateMany).toHaveBeenCalledWith({
        where: { project_id: 'p1', owner_id: 'user-1', status: 'preparation' },
        data: { status: 'depose', deposited_at: expect.any(Date), filing_reference: 'J-2026-001' },
      });
    });

    it('référence absente ou vide : null', async () => {
      await service.marquerDepose('user-1', 'p1', '   ');
      expect(prisma.creation_filings.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ filing_reference: null }) }),
      );
    });

    it('409 si déjà déposé (aucune ligne en préparation mise à jour)', async () => {
      prisma.creation_filings.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.marquerDepose('user-1', 'p1')).rejects.toThrow(ConflictException);
    });

    // Ce test ne prouve pas l'atomicité de Postgres (un mock ne le peut pas) :
    // il simule une ligne qui n'applique que les écritures dont le `where`
    // correspond, et prouve que le service s'appuie sur la garde du statut —
    // le second dépôt ne réécrit ni la date ni la référence du premier.
    it('deux dépôts simultanés : la garde sur le statut garde le premier, le second reçoit 409', async () => {
      const ligne: Record<string, unknown> = { status: 'preparation', deposited_at: null, filing_reference: null };
      prisma.creation_filings.updateMany.mockImplementation(
        async ({ where, data }: { where: { status?: string }; data: Record<string, unknown> }) => {
          if (where.status !== undefined && where.status !== ligne.status) return { count: 0 };
          Object.assign(ligne, data);
          return { count: 1 };
        },
      );
      const resultats = await Promise.allSettled([
        service.marquerDepose('user-1', 'p1', 'A'),
        service.marquerDepose('user-1', 'p1', 'B'),
      ]);
      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejet = resultats.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejet.reason).toBeInstanceOf(ConflictException);
      expect(ligne).toMatchObject({ status: 'depose', filing_reference: 'A' });
    });

    it('une création concurrente de la ligne n’est pas une erreur', async () => {
      prisma.creation_filings.upsert.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.marquerDepose('user-1', 'p1')).resolves.toBeDefined();
    });
  });

  describe('rouvrir', () => {
    it('repasse en préparation et efface date et référence, gardé sur le statut depose', async () => {
      await service.rouvrir('user-1', 'p1');
      expect(prisma.creation_filings.updateMany).toHaveBeenCalledWith({
        where: { project_id: 'p1', owner_id: 'user-1', status: 'depose' },
        data: { status: 'preparation', deposited_at: null, filing_reference: null },
      });
    });

    it('409 si le dossier n’est pas déposé', async () => {
      prisma.creation_filings.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.rouvrir('user-1', 'p1')).rejects.toThrow(ConflictException);
    });
  });

  describe('recapitulatifPdf', () => {
    it('se génère sans statuts ni identité', async () => {
      const pdf = await service.recapitulatifPdf('user-1', 'p1');
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('se génère avec des statuts et leurs associés', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({
        status: 'retenue',
        head_office: 'Paris',
        capital_cents: 100000,
        associates: [{ full_name: 'Alice', share_basis_points: 10000 }],
      });
      const pdf = await service.recapitulatifPdf('user-1', 'p1');
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
