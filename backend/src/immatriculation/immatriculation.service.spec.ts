import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImmatriculationService } from './immatriculation.service.js';

describe('ImmatriculationService', () => {
  let service: ImmatriculationService;
  let prisma: any;
  let ledger: {
    listAccounts: ReturnType<typeof vi.fn>;
    openAccount: ReturnType<typeof vi.fn>;
    recordEntry: ReturnType<typeof vi.fn>;
    findEntry: ReturnType<typeof vi.fn>;
    findEntryByReference: ReturnType<typeof vi.fn>;
  };

  const projet = (confirmed_legal_form: string | null = 'SASU') => ({ id: 'p1', title: 'Ma Société', confirmed_legal_form });
  const ligneFiche = (extra: Record<string, unknown> = {}) => ({
    id: 'r1',
    project_id: 'p1',
    owner_id: 'user-1',
    siren: '443061841',
    siret: null,
    vat_number: null,
    legal_name: 'Ma Société',
    head_office: '1 rue de la Paix, 75002 Paris',
    registered_on: new Date('2026-10-01T00:00:00Z'),
    capital_entry_id: null,
    capital_reserved_at: null,
    created_at: new Date('2026-10-02T00:00:00Z'),
    updated_at: new Date('2026-10-02T00:00:00Z'),
    ...extra,
  });
  const statutsRetenus = { status: 'retenue', legal_form: 'SASU', capital_cents: 100000, head_office: 'Siège des statuts' };
  const saisie = {
    siren: '443 061 841',
    siret: '44306184100013',
    vatNumber: 'FR64443061841',
    legalName: 'Ma Société',
    headOffice: '1 rue de la Paix, 75002 Paris',
    registeredOn: '2026-10-01',
  };
  const NATURES: Record<string, string> = { '512': 'actif', '101': 'capitaux' };
  const compte = (code: string, currency = 'EUR', kind = NATURES[code]) => ({ id: `acc-${code}`, code, currency, kind });
  /** Ce que le montant et la date affichés valent pour la proposition des statuts retenus. */
  const confirmation = { montantCents: 100000, date: '2026-10-01' };
  /** L'écriture telle que `LedgerService.findEntry` la rend (lignes et comptes inclus). */
  const ecritureEnBase = (id = 'entry-1') => ({
    id,
    owner_type: 'user',
    owner_id: 'user-1',
    occurred_on: new Date('2026-10-01T00:00:00Z'),
    label: 'Apport en capital — Ancien nom',
    reference: 'SIREN 443061841',
    currency: 'EUR',
    lines: [
      { debit_cents: 50000, credit_cents: 0, account: { code: '512', label: 'Banque — compte principal', kind: 'actif' } },
      { debit_cents: 0, credit_cents: 50000, account: { code: '101', label: 'Capital', kind: 'capitaux' } },
    ],
  });
  const ilYA = (ms: number) => new Date(Date.now() - ms);

  beforeEach(async () => {
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue(projet()) },
      company_bylaws: { findFirst: vi.fn().mockResolvedValue(null) },
      company_registrations: {
        // 1er appel : la fiche du projet ; les contrôles de SIREN passent par le même mock.
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    ledger = {
      listAccounts: vi.fn().mockResolvedValue([]),
      openAccount: vi.fn((_owner, input: { code: string }) => Promise.resolve(compte(input.code))),
      recordEntry: vi.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
      findEntry: vi.fn().mockResolvedValue(null),
      findEntryByReference: vi.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImmatriculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledger },
      ],
    }).compile();
    service = moduleRef.get(ImmatriculationService);
  });

  /** La fiche du projet (where.project_id) vs le contrôle « SIREN ailleurs » (where.siren). */
  const ficheEnBase = (fiche: unknown, sirenAilleurs: unknown = null) =>
    prisma.company_registrations.findFirst.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve('siren' in args.where ? sirenAilleurs : fiche),
    );

  describe('vérification du propriétaire', () => {
    // Un collaborateur n'est pas propriétaire : même requête filtrée, même 404.
    it.each([
      ['obtenir', (s: ImmatriculationService) => s.obtenir('autre', 'p1')],
      ['enregistrer', (s: ImmatriculationService) => s.enregistrer('autre', 'p1', saisie)],
      ['supprimer', (s: ImmatriculationService) => s.supprimer('autre', 'p1')],
      ['obtenirCapital', (s: ImmatriculationService) => s.obtenirCapital('autre', 'p1')],
      ['enregistrerCapital', (s: ImmatriculationService) => s.enregistrerCapital('autre', 'p1', confirmation)],
    ])('%s : 404 « Projet introuvable. » sans rien lire ni écrire d’autre', async (_nom, appel) => {
      prisma.projects.findFirst.mockResolvedValue(null);
      await expect(appel(service)).rejects.toThrow(new NotFoundException('Projet introuvable.'));
      expect(prisma.projects.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', owner_id: 'autre' } }),
      );
      expect(prisma.company_registrations.findFirst).not.toHaveBeenCalled();
      expect(prisma.company_registrations.upsert).not.toHaveBeenCalled();
      expect(prisma.company_registrations.deleteMany).not.toHaveBeenCalled();
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });
  });

  describe('obtenir', () => {
    it('rien saisi, pas de statuts retenus : registration et suggestion nulles', async () => {
      expect(await service.obtenir('user-1', 'p1')).toEqual({ registration: null, suggestion: null });
    });

    it('propose dénomination et siège depuis des statuts retenus', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      expect((await service.obtenir('user-1', 'p1')).suggestion).toEqual({
        legalName: 'Ma Société',
        headOffice: 'Siège des statuts',
      });
    });

    it('aucune suggestion depuis des statuts en brouillon', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ ...statutsRetenus, status: 'brouillon' });
      expect((await service.obtenir('user-1', 'p1')).suggestion).toBeNull();
    });

    it('rend la fiche en camelCase, date au format AAAA-MM-JJ', async () => {
      ficheEnBase(ligneFiche());
      expect((await service.obtenir('user-1', 'p1')).registration).toEqual({
        id: 'r1',
        projectId: 'p1',
        siren: '443061841',
        siret: null,
        vatNumber: null,
        legalName: 'Ma Société',
        headOffice: '1 rue de la Paix, 75002 Paris',
        registeredOn: '2026-10-01',
        capitalEntryId: null,
        createdAt: new Date('2026-10-02T00:00:00Z'),
        updatedAt: new Date('2026-10-02T00:00:00Z'),
      });
    });
  });

  describe('enregistrer (PUT)', () => {
    it('refuse une saisie invalide (400) sans rien écrire', async () => {
      await expect(service.enregistrer('user-1', 'p1', { ...saisie, siren: '443061842' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.company_registrations.upsert).not.toHaveBeenCalled();
    });

    it('crée ou remplace la fiche normalisée, sans jamais toucher capital_entry_id', async () => {
      await service.enregistrer('user-1', 'p1', saisie);
      const args = prisma.company_registrations.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ project_id: 'p1' });
      expect(args.create).toMatchObject({ owner_id: 'user-1', project_id: 'p1', siren: '443061841', siret: '44306184100013', vat_number: 'FR64443061841' });
      expect(args.update).toEqual({
        siren: '443061841',
        siret: '44306184100013',
        vat_number: 'FR64443061841',
        legal_name: 'Ma Société',
        head_office: '1 rue de la Paix, 75002 Paris',
        registered_on: new Date('2026-10-01T00:00:00Z'),
      });
      expect(args.update).not.toHaveProperty('capital_entry_id');
    });

    it('PUT répété : remplace (upsert), rend l’état complet', async () => {
      ficheEnBase(ligneFiche());
      const etat = await service.enregistrer('user-1', 'p1', { ...saisie, legalName: 'Nouveau nom' });
      expect(prisma.company_registrations.upsert).toHaveBeenCalledTimes(1);
      expect(etat.registration?.id).toBe('r1');
    });

    it('409 si le SIREN est déjà utilisé par un AUTRE projet du même propriétaire', async () => {
      ficheEnBase(null, { id: 'autre-fiche' });
      await expect(service.enregistrer('user-1', 'p1', saisie)).rejects.toThrow(ConflictException);
      const controle = prisma.company_registrations.findFirst.mock.calls.find(
        ([args]: [{ where: Record<string, unknown> }]) => 'siren' in args.where,
      );
      expect(controle[0].where).toEqual({ owner_id: 'user-1', siren: '443061841', project_id: { not: 'p1' } });
      expect(prisma.company_registrations.upsert).not.toHaveBeenCalled();
    });

    it('409 si le SIREN est pris entre le contrôle et l’écriture (P2002)', async () => {
      let controles = 0;
      prisma.company_registrations.findFirst.mockImplementation((args: { where: Record<string, unknown> }) => {
        if (!('siren' in args.where)) return Promise.resolve(null);
        controles += 1;
        return Promise.resolve(controles === 1 ? null : { id: 'autre-fiche' });
      });
      prisma.company_registrations.upsert.mockRejectedValue({ code: 'P2002' });
      await expect(service.enregistrer('user-1', 'p1', saisie)).rejects.toThrow(
        'Ce SIREN est déjà enregistré sur un autre de tes projets.',
      );
    });

    it('deux premiers PUT simultanés : la violation sur project_id se rejoue une fois', async () => {
      prisma.company_registrations.upsert.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({});
      await service.enregistrer('user-1', 'p1', saisie);
      expect(prisma.company_registrations.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('supprimer (DELETE)', () => {
    it('404 quand il n’y a pas de fiche', async () => {
      await expect(service.supprimer('user-1', 'p1')).rejects.toThrow(NotFoundException);
    });

    it('supprime par une écriture gardée sur capital_entry_id nul', async () => {
      prisma.company_registrations.findFirst.mockResolvedValueOnce(ligneFiche()).mockResolvedValue(null);
      const etat = await service.supprimer('user-1', 'p1');
      expect(prisma.company_registrations.deleteMany).toHaveBeenCalledWith({
        where: { id: 'r1', owner_id: 'user-1', capital_entry_id: null },
      });
      expect(etat.registration).toBeNull();
    });

    it('409 quand une écriture de capital a été enregistrée', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'entry-1' }));
      ledger.findEntry.mockResolvedValue(ecritureEnBase());
      await expect(service.supprimer('user-1', 'p1')).rejects.toThrow(ConflictException);
      expect(ledger.findEntry).toHaveBeenCalledWith({ type: 'user', userId: 'user-1' }, 'entry-1');
      expect(prisma.company_registrations.deleteMany).not.toHaveBeenCalled();
    });

    it('409 « en cours » quand une réservation récente n’a pas encore d’écriture', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(30_000) }));
      await expect(service.supprimer('user-1', 'p1')).rejects.toThrow(
        'Un enregistrement est en cours, réessaie dans un instant.',
      );
      expect(prisma.company_registrations.deleteMany).not.toHaveBeenCalled();
    });

    it('réservation abandonnée (plus de 2 minutes, sans écriture) : la suppression passe, gardée sur cette réservation', async () => {
      prisma.company_registrations.findFirst
        .mockResolvedValueOnce(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(5 * 60_000) }))
        .mockResolvedValue(null);
      const etat = await service.supprimer('user-1', 'p1');
      expect(prisma.company_registrations.deleteMany).toHaveBeenCalledWith({
        where: { id: 'r1', owner_id: 'user-1', capital_entry_id: 'resa-1' },
      });
      expect(etat.registration).toBeNull();
    });

    it('409 quand l’écriture de capital arrive entre la lecture et la suppression', async () => {
      ficheEnBase(ligneFiche());
      prisma.company_registrations.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.supprimer('user-1', 'p1')).rejects.toThrow(ConflictException);
    });
  });

  describe('capital — proposition (GET)', () => {
    it('sans fiche : pas de proposition', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat).toMatchObject({ proposition: null, dejaEnregistree: false });
      expect(etat.raison).toBeTruthy();
    });

    it('statuts absents : pas de proposition', async () => {
      ficheEnBase(ligneFiche());
      expect((await service.obtenirCapital('user-1', 'p1')).proposition).toBeNull();
    });

    it('statuts en brouillon : pas de proposition', async () => {
      ficheEnBase(ligneFiche());
      prisma.company_bylaws.findFirst.mockResolvedValue({ ...statutsRetenus, status: 'brouillon' });
      expect((await service.obtenirCapital('user-1', 'p1')).proposition).toBeNull();
    });

    it.each(['micro-entreprise', 'EI'])('%s : pas de proposition de capital', async (forme) => {
      prisma.projects.findFirst.mockResolvedValue(projet(forme));
      ficheEnBase(ligneFiche());
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat.proposition).toBeNull();
      expect(etat.raison).toContain('pas de capital social');
    });

    it('statuts retenus + fiche : Débit 512 / Crédit 101 du capital', async () => {
      ficheEnBase(ligneFiche());
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat.dejaEnregistree).toBe(false);
      expect(etat.raison).toBeNull();
      expect(etat.proposition?.montantCents).toBe(100000);
      expect(etat.proposition?.lignes.map((l) => [l.compte, l.debitCents, l.creditCents])).toEqual([
        ['512', 100000, 0],
        ['101', 0, 100000],
      ]);
    });

    it('déjà enregistrée : rend la VRAIE écriture du journal, pas une proposition recalculée', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'entry-1' }));
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      ledger.findEntry.mockResolvedValue(ecritureEnBase());
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(ledger.findEntry).toHaveBeenCalledWith({ type: 'user', userId: 'user-1' }, 'entry-1');
      expect(etat).toEqual({
        proposition: null,
        dejaEnregistree: true,
        enregistrementEnCours: false,
        raison: null,
        enregistree: {
          entryId: 'entry-1',
          date: '2026-10-01',
          libelle: 'Apport en capital — Ancien nom',
          montantCents: 50000,
          lignes: [
            { compte: '512', libelleCompte: 'Banque — compte principal', natureCompte: 'actif', debitCents: 50000, creditCents: 0 },
            { compte: '101', libelleCompte: 'Capital', natureCompte: 'capitaux', debitCents: 0, creditCents: 50000 },
          ],
        },
      });
    });

    it.each(['micro-entreprise', 'EI'])('forme passée en %s après coup : l’écriture enregistrée reste montrée, sans raison contradictoire', async (forme) => {
      prisma.projects.findFirst.mockResolvedValue(projet(forme));
      ficheEnBase(ligneFiche({ capital_entry_id: 'entry-1' }));
      ledger.findEntry.mockResolvedValue(ecritureEnBase());
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat.enregistree?.entryId).toBe('entry-1');
      expect(etat.dejaEnregistree).toBe(true);
      expect(etat.raison).toBeNull();
    });

    it('identifiant sans écriture au journal (réservation pendante) : PAS enregistrée', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(5 * 60_000) }));
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat.dejaEnregistree).toBe(false);
      expect(etat.enregistree).toBeNull();
      expect(etat.enregistrementEnCours).toBe(false);
      expect(etat.proposition?.montantCents).toBe(100000);
    });

    it('réservation récente sans écriture : pas enregistrée, mais « en cours »', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(10_000) }));
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
      const etat = await service.obtenirCapital('user-1', 'p1');
      expect(etat.dejaEnregistree).toBe(false);
      expect(etat.enregistrementEnCours).toBe(true);
    });
  });

  describe('capital — enregistrement (POST)', () => {
    beforeEach(() => {
      ficheEnBase(ligneFiche());
      prisma.company_bylaws.findFirst.mockResolvedValue(statutsRetenus);
    });

    it('réserve la fiche, ouvre les comptes manquants, passe par recordEntry pour la personne, puis pose le lien', async () => {
      const resultat = await service.enregistrerCapital('user-1', 'p1', confirmation);

      const [reservation, lien] = prisma.company_registrations.updateMany.mock.calls.map(([a]: [any]) => a);
      expect(reservation.where).toEqual({ id: 'r1', owner_id: 'user-1', capital_entry_id: null });
      expect(typeof reservation.data.capital_entry_id).toBe('string');
      expect(reservation.data.capital_reserved_at).toBeInstanceOf(Date);

      expect(ledger.openAccount).toHaveBeenCalledWith(
        { type: 'user', userId: 'user-1' },
        { code: '512', label: 'Banque — compte principal', kind: 'actif' },
      );
      expect(ledger.openAccount).toHaveBeenCalledWith(
        { type: 'user', userId: 'user-1' },
        { code: '101', label: 'Capital', kind: 'capitaux' },
      );
      expect(ledger.recordEntry).toHaveBeenCalledWith({ type: 'user', userId: 'user-1' }, {
        occurredOn: new Date('2026-10-01T00:00:00Z'),
        label: 'Apport en capital — Ma Société',
        reference: 'SIREN 443061841',
        currency: 'EUR',
        lines: [
          { accountId: 'acc-512', debitCents: 100000, creditCents: 0 },
          { accountId: 'acc-101', debitCents: 0, creditCents: 100000 },
        ],
      });

      expect(lien).toEqual({
        where: { id: 'r1', capital_entry_id: reservation.data.capital_entry_id },
        data: { capital_entry_id: 'entry-1' },
      });
      expect(resultat.entryId).toBe('entry-1');
    });

    it('réutilise les comptes 512/101 déjà ouverts', async () => {
      ledger.listAccounts.mockResolvedValue([compte('512'), compte('101')]);
      await service.enregistrerCapital('user-1', 'p1', confirmation);
      expect(ledger.openAccount).not.toHaveBeenCalled();
    });

    it('double POST : 409, sans rien écrire au journal', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'entry-1' }));
      ledger.findEntry.mockResolvedValue(ecritureEnBase());
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(
        'L’écriture de capital a déjà été enregistrée pour cette fiche.',
      );
      expect(ledger.recordEntry).not.toHaveBeenCalled();
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['montant', { ...confirmation, montantCents: 50000 }],
      ['date', { ...confirmation, date: '2026-09-30' }],
    ])('%s affiché ≠ proposition recalculée : 409, rien de réservé ni écrit', async (_cas, vu) => {
      await expect(service.enregistrerCapital('user-1', 'p1', vu)).rejects.toThrow(
        'La proposition a changé depuis son affichage — recharge-la avant d’enregistrer.',
      );
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });

    it('réservation récente sans écriture : 409 « en cours », rien écrit', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(30_000) }));
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(
        'Un enregistrement est en cours, réessaie dans un instant.',
      );
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });

    it.each([
      ['plus de 2 minutes', ilYA(5 * 60_000)],
      ['sans date de réservation', null],
    ])('réservation abandonnée (%s) : reprise par une écriture gardée sur l’ancienne valeur', async (_cas, quand) => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: quand }));
      const resultat = await service.enregistrerCapital('user-1', 'p1', confirmation);
      const [reprise, lien] = prisma.company_registrations.updateMany.mock.calls.map(([a]: [any]) => a);
      expect(reprise.where).toEqual({ id: 'r1', owner_id: 'user-1', capital_entry_id: 'resa-1' });
      expect(reprise.data.capital_entry_id).not.toBe('resa-1');
      expect(ledger.findEntryByReference).toHaveBeenCalledWith({ type: 'user', userId: 'user-1' }, 'SIREN 443061841');
      expect(ledger.recordEntry).toHaveBeenCalledTimes(1);
      expect(lien.data).toEqual({ capital_entry_id: 'entry-1' });
      expect(resultat.entryId).toBe('entry-1');
    });

    it('réservation abandonnée reprise entre-temps par une autre demande : 409', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(5 * 60_000) }));
      prisma.company_registrations.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(ConflictException);
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });

    it('réservation abandonnée mais une écriture « SIREN … » existe déjà (lien jamais posé) : 409, jamais de doublon', async () => {
      ficheEnBase(ligneFiche({ capital_entry_id: 'resa-1', capital_reserved_at: ilYA(5 * 60_000) }));
      ledger.findEntryByReference.mockResolvedValue(ecritureEnBase('entry-orpheline'));
      const erreur = await service.enregistrerCapital('user-1', 'p1', confirmation).catch((e) => e);
      expect(erreur).toBeInstanceOf(ConflictException);
      expect(erreur.message).toContain('entry-orpheline');
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });

    it('compte 512 existant d’une autre nature : 400 clair, réservation libérée', async () => {
      ledger.listAccounts.mockResolvedValue([compte('512', 'EUR', 'passif'), compte('101')]);
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(
        'Ton compte 512 est de nature « passif » : l’écriture de capital attend un compte de nature « actif ».',
      );
      expect(ledger.recordEntry).not.toHaveBeenCalled();
      expect(prisma.company_registrations.updateMany.mock.calls[1][0].data).toEqual({
        capital_entry_id: null,
        capital_reserved_at: null,
      });
    });

    it('compte 101 existant d’une autre nature : 400', async () => {
      ledger.listAccounts.mockResolvedValue([compte('512'), compte('101', 'EUR', 'produit')]);
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(BadRequestException);
      expect(ledger.recordEntry).not.toHaveBeenCalled();
    });

    it('deux POST simultanés : la réservation gardée fait perdre le second (409)', async () => {
      prisma.company_registrations.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(ConflictException);
      expect(ledger.recordEntry).not.toHaveBeenCalled();
      expect(ledger.openAccount).not.toHaveBeenCalled();
    });

    it('statuts en brouillon : 400, rien de réservé', async () => {
      prisma.company_bylaws.findFirst.mockResolvedValue({ ...statutsRetenus, status: 'brouillon' });
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(BadRequestException);
      expect(prisma.company_registrations.updateMany).not.toHaveBeenCalled();
    });

    it('micro-entreprise : 400', async () => {
      prisma.projects.findFirst.mockResolvedValue(projet('micro-entreprise'));
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(BadRequestException);
    });

    it('sans fiche : 404', async () => {
      ficheEnBase(null);
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(NotFoundException);
    });

    it('compte impossible à ouvrir : refus clair, réservation libérée', async () => {
      ledger.openAccount.mockRejectedValue(new BadRequestException('refusé'));
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow('refusé');
      expect(ledger.recordEntry).not.toHaveBeenCalled();
      const liberation = prisma.company_registrations.updateMany.mock.calls[1][0];
      expect(liberation.data).toEqual({ capital_entry_id: null, capital_reserved_at: null });
    });

    it('compte existant dans une autre devise : 400 clair, réservation libérée', async () => {
      ledger.listAccounts.mockResolvedValue([compte('512', 'CHF'), compte('101')]);
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow(/CHF/);
      expect(ledger.recordEntry).not.toHaveBeenCalled();
      expect(prisma.company_registrations.updateMany.mock.calls[1][0].data).toEqual({ capital_entry_id: null, capital_reserved_at: null });
    });

    it('refus du moteur (recordEntry) : propagé tel quel, réservation libérée', async () => {
      ledger.recordEntry.mockRejectedValue(new BadRequestException('écriture refusée'));
      await expect(service.enregistrerCapital('user-1', 'p1', confirmation)).rejects.toThrow('écriture refusée');
      expect(prisma.company_registrations.updateMany.mock.calls[1][0].data).toEqual({ capital_entry_id: null, capital_reserved_at: null });
    });

    it('écriture faite mais lien non posé : état incohérent signalé, pas masqué', async () => {
      prisma.company_registrations.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error('base indisponible'));
      const erreur = await service.enregistrerCapital('user-1', 'p1', confirmation).catch((e) => e);
      expect(erreur).toBeInstanceOf(InternalServerErrorException);
      expect(erreur.message).toContain('entry-1');
      expect(erreur.message).toContain('incohérent');
    });
  });
});
