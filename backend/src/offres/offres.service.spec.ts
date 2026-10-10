import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { OffresService } from './offres.service.js';

describe('OffresService', () => {
  let service: OffresService;
  let prisma: {
    subscriptions: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    participation_agreements: { findMany: ReturnType<typeof vi.fn> };
  };
  let fournisseurInitial: string | undefined;
  let betaInitial: string | undefined;

  beforeEach(async () => {
    fournisseurInitial = process.env.PAIEMENT_FOURNISSEUR;
    delete process.env.PAIEMENT_FOURNISSEUR;
    betaInitial = process.env.IGNITUX_BETA_V1;
    delete process.env.IGNITUX_BETA_V1;

    prisma = {
      subscriptions: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      // Aucun accord par défaut : l'offre se lit comme avant.
      participation_agreements: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OffresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OffresService);
  });

  afterEach(() => {
    if (fournisseurInitial === undefined) delete process.env.PAIEMENT_FOURNISSEUR;
    else process.env.PAIEMENT_FOURNISSEUR = fournisseurInitial;
    if (betaInitial === undefined) delete process.env.IGNITUX_BETA_V1;
    else process.env.IGNITUX_BETA_V1 = betaInitial;
  });

  describe('lire l’offre', () => {
    // Hors bêta V1 (voir describe dédié plus bas) : le repli général reste
    // Découverte, la gratuite définitive du catalogue.
    it('retombe sur Découverte quand aucune ligne n’existe', async () => {
      process.env.IGNITUX_BETA_V1 = 'false';
      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    it('lit l’offre en base', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'entrepreneur', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    // Construction a été fusionnée dans Entrepreneur : une ligne qui porte
    // encore l'ancien nom ne doit pas faire perdre ce qui a été payé.
    it('lit l’ancienne offre « construction » comme Entrepreneur', async () => {
      process.env.IGNITUX_BETA_V1 = 'false';
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'construction', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    // Laisser ouvert après la fin ferait payer une fois pour toujours.
    it('redescend à Découverte quand l’engagement est terminé', async () => {
      process.env.IGNITUX_BETA_V1 = 'false';
      prisma.subscriptions.findUnique.mockResolvedValue({
        offre: 'construction',
        ends_on: new Date('2020-01-01'),
      });

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    it('garde l’offre tant que la fin n’est pas passée', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({
        offre: 'entrepreneur',
        ends_on: new Date('2099-01-01'),
      });

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('ignore une valeur d’offre inconnue plutôt que de l’honorer', async () => {
      process.env.IGNITUX_BETA_V1 = 'false';
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'illimitee', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    // Un incident de base ne doit pas priver quelqu'un de son produit. Le
    // repli sur la gratuite ne lui retire rien qu'il ait payé.
    it('retombe sur Découverte si la lecture échoue, sans propager', async () => {
      process.env.IGNITUX_BETA_V1 = 'false';
      prisma.subscriptions.findUnique.mockRejectedValue(new Error('base injoignable'));

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });
  });

  describe('lire l’offre garantie par un accord de participation', () => {
    beforeEach(() => {
      process.env.IGNITUX_BETA_V1 = 'false';
    });

    it('donne l’offre de l’accord à quelqu’un qui n’a aucun abonnement', async () => {
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'entrepreneur' }]);

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('lit un accord signé avec l’ancienne offre « construction » comme Entrepreneur', async () => {
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'construction' }]);

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('ne cherche que les accords actifs ou transmis du porteur — jamais le capital', async () => {
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'entrepreneur' }]);

      await service.offreDe('u1');

      expect(prisma.participation_agreements.findMany.mock.calls[0][0].where).toEqual({
        project: { owner_id: 'u1' },
        status: { in: ['actif', 'transmis'] },
      });
    });

    it('garde la meilleure offre entre l’abonnement et l’accord', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'entrepreneur', ends_on: null });
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'decouverte' }]);

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('relève l’abonnement quand l’accord garantit mieux', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'decouverte', ends_on: null });
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'entrepreneur' }]);

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('prend la meilleure offre quand la personne a plusieurs accords', async () => {
      prisma.participation_agreements.findMany.mockResolvedValue([
        { ecosystem_offre: 'decouverte' },
        { ecosystem_offre: 'entrepreneur' },
      ]);

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('ignore une offre d’accord inconnue du catalogue', async () => {
      prisma.participation_agreements.findMany.mockResolvedValue([{ ecosystem_offre: 'illimitee' }]);

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    // Un incident sur la lecture des accords ne doit pas retirer ce que
    // l'abonnement donne.
    it('retombe sur l’abonnement si la lecture des accords échoue, sans propager', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'entrepreneur', ends_on: null });
      prisma.participation_agreements.findMany.mockRejectedValue(new Error('base injoignable'));

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });
  });

  describe('lire l’offre pendant la bêta V1', () => {
    // Aucun moyen de paiement n'existe pendant la bêta : rester sur
    // Découverte empêcherait un testeur d'essayer 5 des 6 générateurs
    // (seule 'analyser' y est incluse). Le repli de la bêta est donc
    // Entrepreneur, pas Découverte — le plafond de coût (2€/mois/personne)
    // continue de protéger la facture, inchangé.
    it('remonte à Entrepreneur quand aucune ligne n’existe, par défaut (bêta active)', async () => {
      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('remonte à Entrepreneur quand l’engagement est terminé', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({
        offre: 'construction',
        ends_on: new Date('2020-01-01'),
      });

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('remonte à Entrepreneur si la lecture échoue, sans propager', async () => {
      prisma.subscriptions.findUnique.mockRejectedValue(new Error('base injoignable'));

      await expect(service.offreDe('u1')).resolves.toBe('entrepreneur');
    });

    it('respecte toujours une offre explicitement enregistrée', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'decouverte', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });
  });

  describe('exiger un droit', () => {
    it('laisse passer ce que l’offre couvre', async () => {
      await expect(
        service.exiger('u1', { kind: 'creer_projet', projetsActuels: 0 }),
      ).resolves.toBeUndefined();
    });

    it('refuse en portant l’offre qui ouvrirait, pas seulement un message', async () => {
      // Hors bêta : le repli est Découverte, qui n'a pas les outils de gestion.
      process.env.IGNITUX_BETA_V1 = 'false';
      const erreur = await service
        .exiger('u1', { kind: 'outil_de_gestion', outil: 'comptabilite' })
        .catch((e) => e);

      expect(erreur).toBeInstanceOf(ForbiddenException);
      const corps = erreur.getResponse();
      expect(corps.offreQuiOuvre).toBe('entrepreneur');
      expect(corps.seRenouvelleLeMoisProchain).toBe(false);
    });

    // L'interface doit pouvoir dire « reviens le mois prochain » plutôt que
    // « paie », et elle ne peut pas le deviner à partir d'un code HTTP.
    it('distingue un quota épuisé d’une capacité absente', async () => {
      const erreur = await service
        .exiger('u1', { kind: 'generer', generateur: 'analyser', appelsCeMois: 99 })
        .catch((e) => e);

      expect(erreur.getResponse().seRenouvelleLeMoisProchain).toBe(true);
    });
  });

  describe('changer d’offre', () => {
    // Une route qui accorde l’offre payante sans rien encaisser est une route
    // qui donne le produit, et elle finirait par être trouvée.
    it('refuse une offre payante quand rien n’encaisse, et le dit', async () => {
      const erreur = await service.changer('u1', 'entrepreneur').catch((e) => e);

      expect(erreur).toBeInstanceOf(ForbiddenException);
      expect(String(erreur.getResponse().message ?? erreur.message)).toMatch(
        /aucun moyen de paiement/i,
      );
      expect(prisma.subscriptions.upsert).not.toHaveBeenCalled();
    });

    it('refuse une offre payante sans référence d’encaissement, même avec un fournisseur', async () => {
      process.env.PAIEMENT_FOURNISSEUR = 'stripe';

      await expect(service.changer('u1', 'entrepreneur')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.subscriptions.upsert).not.toHaveBeenCalled();
    });

    it('accepte une offre payante confirmée par le fournisseur', async () => {
      process.env.PAIEMENT_FOURNISSEUR = 'stripe';
      prisma.subscriptions.upsert.mockResolvedValue({ id: 's1' });

      await service.changer('u1', 'entrepreneur', {
        fournisseur: 'stripe',
        reference: 'sub_123',
      });

      const appel = prisma.subscriptions.upsert.mock.calls[0][0];
      expect(appel.create.offre).toBe('entrepreneur');
      expect(appel.create.provider_ref).toBe('sub_123');
    });

    // On peut toujours redescendre : personne ne doit rester enfermé dans
    // une offre payante par manque de bouton.
    it('laisse toujours revenir à la gratuite', async () => {
      prisma.subscriptions.upsert.mockResolvedValue({ id: 's1' });

      await expect(service.changer('u1', 'decouverte')).resolves.toBeTruthy();
    });
  });

  describe('la page des offres', () => {
    it('dit qu’aucune souscription n’est possible quand rien n’encaisse', async () => {
      const vue = await service.catalogue('u1');

      expect(vue.souscriptionPossible).toBe(false);
      // Entrepreneur, pas Découverte : repli de la bêta V1 (voir describe
      // dédié plus haut), actif par défaut dans ce fichier de test.
      expect(vue.actuelle).toBe('entrepreneur');
    });

    it('marque l’offre en cours', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'entrepreneur', ends_on: null });

      const vue = await service.catalogue('u1');

      expect(vue.offres.find((o) => o.actuelle)?.id).toBe('entrepreneur');
      expect(vue.offres.filter((o) => o.actuelle)).toHaveLength(1);
    });

    // L'évaluation de financement ne se vend plus à part : elle est une
    // capacité de l'offre payante, pas un second prix sur la page.
    it('ne propose plus l’évaluation de financement comme un achat séparé', async () => {
      const vue = await service.catalogue('u1');

      expect(vue).not.toHaveProperty('evaluationFinancement');
      expect(vue.offres.find((o) => o.id === 'entrepreneur')?.capacites.evaluationFinancement).toBe(
        true,
      );
    });
  });
});
