import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConstitutionService } from '../constitution/constitution.service.js';
import { BILLING_DISCLAIMER } from './billing-legal.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('BillingService', () => {
  let service: BillingService;
  let module: TestingModule;
  let prisma: {
    billing_documents: { create: Mock; findFirst: Mock; findMany: Mock; update: Mock; delete: Mock };
    billing_payments: { create: Mock };
    constitution_violations: { createMany: Mock };
    crm_contacts: { findFirst: Mock };
  };

  const LINE = { label: 'Prestation', quantityMilli: 1000, unitPriceCents: 10000 };

  beforeEach(async () => {
    prisma = {
      billing_documents: {
        create: vi.fn().mockResolvedValue({ id: 'd1' }),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ id: 'd1' }),
        delete: vi.fn(),
      },
      billing_payments: { create: vi.fn().mockResolvedValue({ id: 'p1' }) },
      crm_contacts: { findFirst: vi.fn() },
      constitution_violations: { createMany: vi.fn() },
    };

    module = await Test.createTestingModule({
      providers: [
        BillingService,
        ConstitutionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe("article 7 — l'avertissement accompagne toujours l'indication", () => {
    it("soumet l'avertissement au moteur constitutionnel avant de rendre la liste", async () => {
      // RÉGRESSION. Le module rend des documents à quelqu'un qui va décider
      // d'émettre une facture réelle. Si l'avertissement disparaissait un
      // jour d'un refactoring, plus rien ne dirait qu'Ignitux ne vérifie
      // ni le régime de TVA ni les mentions obligatoires — et le silence
      // se lirait comme une validation.
      const guard = vi.spyOn(
        module.get(ConstitutionService),
        'guard',
      );

      await service.listDocuments('u1');

      const guidance = guard.mock.calls
        .map(([action]) => action as { kind: string; notice?: string | null })
        .filter((action) => action.kind === 'publish_guidance');

      expect(guidance).toHaveLength(1);
      expect(guidance[0].notice).toBe(BILLING_DISCLAIMER);
    });
  });

  describe('numérotation', () => {
    it('commence à 1 pour le premier document du type et de l\'année', async () => {
      prisma.billing_documents.findFirst.mockResolvedValue(null);

      await service.createDocument('u1', {
        type: 'facture',
        clientName: 'Dupont',
        lines: [LINE],
      });

      const data = prisma.billing_documents.create.mock.calls[0][0].data;
      expect(data.sequence).toBe(1);
      expect(data.number).toMatch(/^FAC-\d{4}-0001$/);
    });

    it('incrémente à partir du maximum existant, pas d\'un compteur séparé', async () => {
      // Un compteur séparé peut diverger de la réalité des lignes ; le
      // maximum réel, non.
      prisma.billing_documents.findFirst.mockResolvedValue({ sequence: 41 });

      await service.createDocument('u1', {
        type: 'facture',
        clientName: 'Dupont',
        lines: [LINE],
      });

      expect(prisma.billing_documents.create.mock.calls[0][0].data.sequence).toBe(42);
    });

    it('sépare les séquences par type de document', async () => {
      prisma.billing_documents.findFirst.mockResolvedValue(null);

      await service.createDocument('u1', { type: 'devis', clientName: 'X', lines: [LINE] });

      const where = prisma.billing_documents.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ owner_id: 'u1', type: 'devis' });
    });
  });

  describe('avoirs', () => {
    it("refuse un avoir qui ne référence aucun document", async () => {
      await expect(
        service.createDocument('u1', { type: 'avoir', clientName: 'X', lines: [LINE] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.billing_documents.create).not.toHaveBeenCalled();
    });

    it("refuse de corriger un brouillon par un avoir", async () => {
      // Un brouillon se modifie ; il n'y a rien à corriger.
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd0',
        owner_id: 'u1',
        status: 'brouillon',
      });

      await expect(
        service.createDocument('u1', {
          type: 'avoir',
          clientName: 'X',
          correctsId: 'd0',
          lines: [LINE],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepte un avoir sur une facture émise', async () => {
      prisma.billing_documents.findFirst
        .mockResolvedValueOnce({ id: 'd0', owner_id: 'u1', status: 'emis' })
        .mockResolvedValue(null);

      await service.createDocument('u1', {
        type: 'avoir',
        clientName: 'X',
        correctsId: 'd0',
        lines: [LINE],
      });

      expect(prisma.billing_documents.create.mock.calls[0][0].data.corrects_id).toBe('d0');
    });
  });

  describe('immuabilité après émission', () => {
    beforeEach(() => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'emis',
      });
    });

    it('refuse de modifier un document émis, en expliquant quoi faire', async () => {
      await expect(
        service.updateDraft('u1', 'd1', { clientName: 'Nouveau nom' }),
      ).rejects.toThrow(/avoir/);
      expect(prisma.billing_documents.update).not.toHaveBeenCalled();
    });

    it('refuse de supprimer un document émis', async () => {
      await expect(service.deleteDraft('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.billing_documents.delete).not.toHaveBeenCalled();
    });

    it('autorise la modification tant que le document est brouillon', async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'brouillon',
      });

      await service.updateDraft('u1', 'd1', { clientName: 'Nouveau nom' });

      expect(prisma.billing_documents.update).toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it("pose la date d'émission au passage à « emis »", async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'brouillon',
        issued_at: null,
      });

      await service.changeStatus('u1', 'd1', 'emis');

      expect(prisma.billing_documents.update.mock.calls[0][0].data.issued_at).toBeInstanceOf(Date);
    });

    it("ne réécrit pas une date d'émission déjà posée", async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'emis',
        issued_at: new Date('2026-01-01'),
      });

      await service.changeStatus('u1', 'd1', 'paye');

      expect(prisma.billing_documents.update.mock.calls[0][0].data.issued_at).toBeUndefined();
    });

    it('refuse un retour en arrière vers brouillon', async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'emis',
      });

      await expect(service.changeStatus('u1', 'd1', 'brouillon')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('règlements', () => {
    it("refuse un règlement sur un brouillon", async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'brouillon',
      });

      await expect(service.addPayment('u1', 'd1', 5000, 'virement')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.billing_payments.create).not.toHaveBeenCalled();
    });

    it('refuse un montant nul ou négatif', async () => {
      prisma.billing_documents.findFirst.mockResolvedValue({
        id: 'd1',
        owner_id: 'u1',
        status: 'emis',
      });

      await expect(service.addPayment('u1', 'd1', 0, 'virement')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('bascule en « payé » quand le solde est couvert', async () => {
      prisma.billing_documents.findFirst
        .mockResolvedValueOnce({ id: 'd1', owner_id: 'u1', status: 'emis' })
        .mockResolvedValueOnce({
          id: 'd1',
          status: 'emis',
          lines: [{ quantity_milli: 1000, unit_price_cents: 10000, vat_rate_basis_points: 0 }],
          payments: [{ amount_cents: 10000 }],
        });

      await service.addPayment('u1', 'd1', 10000, 'virement');

      expect(prisma.billing_documents.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'paye' },
      });
    });

    it('laisse « émis » tant que le solde reste dû', async () => {
      prisma.billing_documents.findFirst
        .mockResolvedValueOnce({ id: 'd1', owner_id: 'u1', status: 'emis' })
        .mockResolvedValueOnce({
          id: 'd1',
          status: 'emis',
          lines: [{ quantity_milli: 1000, unit_price_cents: 10000, vat_rate_basis_points: 0 }],
          payments: [{ amount_cents: 4000 }],
        });

      await service.addPayment('u1', 'd1', 4000, 'virement');

      expect(prisma.billing_documents.update).not.toHaveBeenCalled();
    });
  });

  describe('cloisonnement', () => {
    it("refuse un document qui n'appartient pas à l'appelant", async () => {
      prisma.billing_documents.findFirst.mockResolvedValue(null);

      await expect(service.getDocument('u2', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse de rattacher le contact d'un autre utilisateur", async () => {
      prisma.crm_contacts.findFirst.mockResolvedValue(null);

      await expect(
        service.createDocument('u1', {
          type: 'facture',
          clientName: 'X',
          contactId: 'c1',
          lines: [LINE],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("joint l'avertissement légal à chaque liste de documents", async () => {
    // Enterré dans une page d'aide, personne ne le lirait.
    const result = await service.listDocuments('u1');

    expect(result.disclaimer).toContain("n'est pas pour autant un logiciel de facturation certifié");
  });

  it('refuse un document sans ligne', async () => {
    await expect(
      service.createDocument('u1', { type: 'facture', clientName: 'X', lines: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
