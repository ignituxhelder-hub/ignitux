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
  };
  let fournisseurInitial: string | undefined;

  beforeEach(async () => {
    fournisseurInitial = process.env.PAIEMENT_FOURNISSEUR;
    delete process.env.PAIEMENT_FOURNISSEUR;

    prisma = {
      subscriptions: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OffresService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OffresService);
  });

  afterEach(() => {
    if (fournisseurInitial === undefined) delete process.env.PAIEMENT_FOURNISSEUR;
    else process.env.PAIEMENT_FOURNISSEUR = fournisseurInitial;
  });

  describe('lire l’offre', () => {
    it('retombe sur Découverte quand aucune ligne n’existe', async () => {
      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    it('lit l’offre en base', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'construction', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('construction');
    });

    // Laisser ouvert après la fin ferait payer une fois pour toujours.
    it('redescend à Découverte quand l’engagement est terminé', async () => {
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
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'illimitee', ends_on: null });

      await expect(service.offreDe('u1')).resolves.toBe('decouverte');
    });

    // Un incident de base ne doit pas priver quelqu'un de son produit. Le
    // repli sur la gratuite ne lui retire rien qu'il ait payé.
    it('retombe sur Découverte si la lecture échoue, sans propager', async () => {
      prisma.subscriptions.findUnique.mockRejectedValue(new Error('base injoignable'));

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
      const erreur = await service
        .exiger('u1', { kind: 'outil_de_gestion', outil: 'comptabilite' })
        .catch((e) => e);

      expect(erreur).toBeInstanceOf(ForbiddenException);
      const corps = erreur.getResponse();
      expect(corps.offreQuiOuvre).toBe('construction');
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
    // Une route qui accorde Construction sans rien encaisser est une route
    // qui donne le produit, et elle finirait par être trouvée.
    it('refuse une offre payante quand rien n’encaisse, et le dit', async () => {
      const erreur = await service.changer('u1', 'construction').catch((e) => e);

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
      expect(vue.actuelle).toBe('decouverte');
    });

    it('marque l’offre en cours', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue({ offre: 'entrepreneur', ends_on: null });

      const vue = await service.catalogue('u1');

      expect(vue.offres.find((o) => o.actuelle)?.id).toBe('entrepreneur');
      expect(vue.offres.filter((o) => o.actuelle)).toHaveLength(1);
    });

    // Le montant du financement ne doit jamais s'afficher sans la phrase
    // qui dit ce qu'il achète — et ce qu'il n'achète pas.
    it('accompagne le prix de l’évaluation de son avertissement', async () => {
      const vue = await service.catalogue('u1');

      expect(vue.evaluationFinancement.prixCentimes).toBeGreaterThan(0);
      expect(vue.evaluationFinancement.avertissement).toMatch(/pas un financement/);
    });
  });
});
