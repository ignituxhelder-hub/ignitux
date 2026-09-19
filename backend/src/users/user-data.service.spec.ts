import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { exportedTables } from './user-data-scope.js';
import { UserDataService } from './user-data.service.js';

const GOOD_PASSWORD = 'bon-mot-de-passe';
/**
 * Un vrai hash bcrypt, pas un espion : `vi.spyOn(bcrypt, 'compare')` est
 * impossible sur un module ESM, et vérifier la vraie comparaison vaut mieux
 * que vérifier qu'on a bien appelé un mock. Calculé une seule fois et
 * réutilisé par tous les tests.
 */
let passwordHash: string;

/**
 * Toutes les tables du périmètre sont mockées de la même façon : un
 * `findMany`/`count` qui renvoie du vide par défaut. Les tests qui portent
 * sur une table précise surchargent seulement celle-là.
 */
type Mock = ReturnType<typeof vi.fn>;

/**
 * Une table mockée. Volontairement typée à la main plutôt que dérivée du
 * client Prisma : hériter de ses types ferait croire à TypeScript que
 * `findMany` est la vraie méthode Prisma, qui n'a ni `mockResolvedValue`
 * ni `mock`, et qui déclenche la règle `unbound-method` dès qu'on la passe
 * à `expect`.
 */
interface TableMock {
  findMany: Mock;
  count: Mock;
  findUnique: Mock;
  findUniqueOrThrow: Mock;
  updateMany: Mock;
  delete: Mock;
}

function buildPrismaMock() {
  const prisma: Record<string, TableMock> = {};

  for (const table of exportedTables()) {
    prisma[table] = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
    };
  }

  prisma.users.findUniqueOrThrow = vi.fn().mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    email_verified_at: null,
    created_at: new Date('2026-01-01'),
    password_hash: passwordHash,
  });

  return Object.assign(prisma, { $transaction: vi.fn().mockResolvedValue([]) });
}

describe('UserDataService', () => {
  let service: UserDataService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    // Coût 4 et non 10 : le facteur de coût est embarqué dans le hash, donc
    // une fixture moins coûteuse rend aussi ~18x plus rapide chaque
    // bcrypt.compare qui la vise (71 ms → 4 ms, mesurés). Sous la charge de
    // la suite complète, ces millisecondes faisaient dépasser le délai des
    // hooks et rendaient deux fichiers intermittents. Ce qu'on teste ici,
    // c'est notre logique de comparaison, pas le facteur de coût — celui du
    // service (bcrypt.hash(password, 10) à l'inscription) reste inchangé, et
    // c'est users.service.spec.ts qui le vérifie.
    passwordHash = await bcrypt.hash(GOOD_PASSWORD, 4);
  });

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UserDataService);
  });

  describe("export — droit d'accès", () => {
    it('ne contient jamais le hash du mot de passe', async () => {
      // Le hash n'apprend rien à la personne, et le placer dans un fichier
      // qui circule par email serait une faute.
      const exported = await service.exportUserData('u1');

      expect(JSON.stringify(exported)).not.toContain(passwordHash);
      expect(exported.donnees.compte).not.toHaveProperty('password_hash');
    });

    it('expose les huit catégories annoncées par les CGU', async () => {
      const exported = await service.exportUserData('u1');

      expect(Object.keys(exported.donnees)).toEqual([
        'compte',
        'projets_et_contenus',
        'contenus_generes_par_igini',
        'relations_professionnelles',
        'facturation',
        'financement',
        'communaute_et_marketplace',
        'journaux_techniques',
      ]);
    });

    it('dit aussi ce qu\'il ne contient pas, et pourquoi', async () => {
      // Un fichier qui se présente comme « toutes tes données » sans lister
      // ses exclusions ment par omission.
      const exported = await service.exportUserData('u1');

      expect(exported.non_inclus.length).toBeGreaterThan(0);
      for (const exclusion of exported.non_inclus) {
        expect(exclusion.pourquoi.length).toBeGreaterThan(40);
      }
    });

    it('avertit que le fichier contient des données de tiers', async () => {
      const exported = await service.exportUserData('u1');

      expect(exported.avertissement).toContain('tiers');
    });

    it('récupère bien les trois tables du CRM', async () => {
      // Ces trois-là manquaient à la liste RGPD avant sa correction : le
      // test les nomme pour que l'oubli ne se reproduise pas.
      prisma.crm_contacts.findMany.mockResolvedValue([{ id: 'c1', last_name: 'Durand' }]);
      prisma.crm_companies.findMany.mockResolvedValue([{ id: 'e1', name: 'ACME' }]);
      prisma.crm_interactions.findMany.mockResolvedValue([{ id: 'i1', summary: 'Appel' }]);

      const exported = await service.exportUserData('u1');

      expect(exported.donnees.relations_professionnelles.contacts).toHaveLength(1);
      expect(exported.donnees.relations_professionnelles.entreprises).toHaveLength(1);
      expect(exported.donnees.relations_professionnelles.echanges).toHaveLength(1);
    });

    it('inclut le journal des violations qui concernent la personne', async () => {
      prisma.constitution_violations.findMany.mockResolvedValue([{ id: 'v1', user_id: 'u1' }]);

      const exported = await service.exportUserData('u1');

      expect(
        exported.donnees.journaux_techniques.violations_constitutionnelles,
      ).toHaveLength(1);
    });

    it("ne cherche pas de messages reçus quand la personne n'a pas de profil", async () => {
      // Sans profil Marketplace, `to_profile_id` n'existe pas : interroger
      // la table avec `undefined` renverrait les messages de tout le monde.
      const exported = await service.exportUserData('u1');

      expect(exported.donnees.communaute_et_marketplace.messages_recus).toEqual([]);
      expect(prisma.marketplace_contacts.findMany).toHaveBeenCalledTimes(1);
    });

    it('récupère les messages reçus quand un profil existe', async () => {
      prisma.marketplace_profiles.findUnique.mockResolvedValue({ id: 'p1', user_id: 'u1' });

      await service.exportUserData('u1');

      expect(prisma.marketplace_contacts.findMany).toHaveBeenCalledWith({
        where: { to_profile_id: 'p1' },
      });
    });
  });

  describe('aperçu de suppression', () => {
    it('ne prévient de rien quand il n\'y a rien à perdre', async () => {
      // Un compte vide ne doit pas recevoir six avertissements effrayants
      // sur des données qui n'existent pas.
      const preview = await service.previewDeletion('u1');

      expect(preview.avertissements).toEqual([]);
    });

    it("rappelle l'obligation légale de conserver une facture émise", async () => {
      // La conséquence que la personne ne peut pas deviner : l'obligation
      // de conservation lui incombe, pas à Ignitux.
      prisma.billing_documents.count.mockImplementation(({ where }: { where: { status: unknown } }) =>
        Promise.resolve(JSON.stringify(where.status).includes('not') ? 3 : 0),
      );

      const preview = await service.previewDeletion('u1');

      expect(preview.avertissements.join(' ')).toContain('dix ans');
      expect(preview.resume.documents_de_facturation_emis).toBe(3);
    });

    it('ne parle pas de conservation légale pour de simples brouillons', async () => {
      prisma.billing_documents.count.mockImplementation(({ where }: { where: { status: unknown } }) =>
        Promise.resolve(JSON.stringify(where.status).includes('not') ? 0 : 4),
      );

      const preview = await service.previewDeletion('u1');

      expect(preview.avertissements.join(' ')).not.toContain('dix ans');
    });

    it('prévient que la suppression touche des tiers', async () => {
      // Les messages envoyés disparaissent aussi chez ceux qui les ont
      // reçus : une conséquence sur autrui, qu'il faut annoncer.
      prisma.marketplace_contacts.count.mockResolvedValue(2);

      const preview = await service.previewDeletion('u1');

      expect(preview.avertissements.join(' ')).toContain('destinataires');
    });

    it("dit que les projets d'autrui ne seront pas supprimés", async () => {
      prisma.project_collaborators.count.mockImplementation(
        ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve('user_id' in where ? 1 : 0),
      );

      const preview = await service.previewDeletion('u1');

      expect(preview.avertissements.join(' ')).toContain('ne seront pas supprimés');
    });

    it('annonce que le journal constitutionnel est anonymisé, pas effacé', async () => {
      const preview = await service.previewDeletion('u1');

      expect(preview.journal_constitutionnel).toContain('anonymes');
    });
  });

  describe('suppression du compte', () => {
    it('refuse un mot de passe incorrect en 403, pas en 401', async () => {
      // Un 401 déclenche la déconnexion automatique côté frontend : un mot
      // de passe mal tapé déconnecterait au lieu d'afficher une erreur.
      await expect(service.deleteAccount('u1', 'mauvais-mot-de-passe')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('supprime le compte quand le mot de passe est bon', async () => {
      await service.deleteAccount('u1', GOOD_PASSWORD);

      expect(prisma.users.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("retire l'identifiant du journal des violations au lieu de le laisser pendre", async () => {
      // `constitution_violations` n'a aucune clé étrangère vers `users` :
      // sans cette anonymisation, l'identifiant d'un compte supprimé
      // survivrait dans le journal.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      expect(prisma.constitution_violations.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        data: { user_id: null },
      });
    });

    it('anonymise et supprime dans la même transaction', async () => {
      // Séparées, un échec entre les deux laisserait soit un journal
      // nominatif sans compte, soit un compte supprimé à moitié.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      const operations = prisma.$transaction.mock.calls[0][0] as unknown[];
      expect(operations).toHaveLength(2);
    });
  });
});
