import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { exportedTables } from './user-data-scope.js';
import { UserDataService } from './user-data.service.js';

const GOOD_PASSWORD = 'bon-mot-de-passe';

/**
 * Les tables sans clé étrangère vers `users`, dont l'identifiant doit être
 * retiré à la main. Y ajouter une table ici et oublier de l'anonymiser dans
 * le service fait échouer le test de transaction.
 */
const ANONYMISEES = ['constitution_violations', 'ai_usage_events'] as const;

/**
 * Les tables dont les lignes de la personne sont **effacées**, et non
 * anonymisées : sa comptabilité et ses comptes bancaires lui appartiennent
 * entièrement. Ignitux n'a aucune raison de garder les livres de quelqu'un
 * qui s'en va.
 */
const SUPPRIMEES = ['ledger_entries', 'bank_accounts', 'ledger_accounts'] as const;

/**
 * Les tables dont les lignes de la personne sont **détachées**, ni effacées
 * ni laissées nominatives : l'argent qu'un investisseur a mis dans les
 * projets d'autres personnes est réellement entré chez eux et devra en
 * ressortir. Effacer ses participations falsifierait leurs registres.
 */
const DETACHEES = ['investors', 'financed_projects'] as const;
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
  findFirst: Mock;
  count: Mock;
  findUnique: Mock;
  findUniqueOrThrow: Mock;
  updateMany: Mock;
  delete: Mock;
  deleteMany: Mock;
}

function buildPrismaMock() {
  const prisma: Record<string, TableMock> = {};

  for (const table of exportedTables()) {
    prisma[table] = {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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

    it("n'exporte que les quatre champs de compte prévus, quoi que renvoie la base", async () => {
      // Le test précédent ne surveille qu'un champ connu. Celui-ci
      // surveille la forme : le jour où quelqu'un ajoute une colonne
      // sensible à `users` — codes de secours, jeton de session, adresse
      // postale — elle ne doit pas pouvoir se glisser dans un fichier
      // destiné à circuler par email, même si le `select` de Prisma est
      // élargi au passage.
      prisma.users.findUniqueOrThrow.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        email_verified_at: null,
        created_at: new Date('2026-01-01'),
        password_hash: passwordHash,
        codes_de_secours: 'SECRET-A-NE-JAMAIS-DIFFUSER',
      });

      const exported = await service.exportUserData('u1');

      expect(Object.keys(exported.donnees.compte).sort()).toEqual([
        'compte_cree_le',
        'email',
        'email_verifie_le',
        'id',
      ]);
      expect(JSON.stringify(exported)).not.toContain('SECRET-A-NE-JAMAIS-DIFFUSER');
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

    it("retire l'identifiant du journal des coûts IA sans effacer la dépense", async () => {
      // Même situation que les violations, avec un enjeu supplémentaire :
      // ces tokens ont été facturés et le restent. Effacer la ligne ferait
      // changer rétroactivement le total d'un mois déjà clos, et deux
      // relevés du même mois ne diraient plus la même chose.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      expect(prisma.ai_usage_events.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        data: { user_id: null },
      });
      expect(prisma.ai_usage_events.delete).not.toHaveBeenCalled();
    });

    it('efface la comptabilité de la personne, et pas seulement ses journaux', async () => {
      // Traitement volontairement opposé à celui des deux journaux
      // ci-dessus : les livres d'une personne lui appartiennent et partent
      // avec elle, là où la dépense d'Ignitux reste. Voir ledger-deletion.ts.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      const proprietaire = { owner_type: 'user', owner_id: 'u1' };
      for (const table of SUPPRIMEES) {
        expect(prisma[table].deleteMany).toHaveBeenCalledWith({ where: proprietaire });
      }
    });

    it("détache les investissements au lieu de les effacer", async () => {
      // L'argent qu'un investisseur a mis dans les projets d'autres
      // personnes est réellement entré chez eux. Effacer ses participations
      // falsifierait leurs registres ; laisser son nom conserverait une
      // donnée personnelle après une demande d'effacement. Le fait reste,
      // l'identité part.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      expect(prisma.investors.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        data: { user_id: null, display_name: 'Investisseur retiré', note: null },
      });
      expect(prisma.financed_projects.updateMany).toHaveBeenCalledWith({
        where: { entrepreneur_user_id: 'u1' },
        data: { entrepreneur_user_id: null },
      });
      expect(prisma.participations.deleteMany).not.toHaveBeenCalled();
      expect(prisma.investor_movements.deleteMany).not.toHaveBeenCalled();
    });

    it('anonymise et supprime dans la même transaction', async () => {
      // Séparées, un échec entre les deux laisserait soit un journal
      // nominatif sans compte, soit un compte supprimé à moitié.
      await service.deleteAccount('u1', GOOD_PASSWORD);

      // On décrit ce que la transaction fait, plutôt que de compter ses
      // opérations : un décompte passerait encore si une anonymisation en
      // remplaçait une autre, ce qui est exactement l'erreur qu'un refactor
      // introduit sans le vouloir. Le nombre est vérifié aussi, mais il ne
      // porte pas la garantie à lui seul.
      const operations = prisma.$transaction.mock.calls[0][0] as unknown[];
      expect(operations).toHaveLength(11);

      for (const table of ANONYMISEES) {
        expect(prisma[table].updateMany).toHaveBeenCalledWith({
          where: { user_id: 'u1' },
          data: { user_id: null },
        });
      }
      for (const table of SUPPRIMEES) {
        expect(prisma[table].deleteMany).toHaveBeenCalled();
      }
      for (const table of DETACHEES) {
        expect(prisma[table].updateMany).toHaveBeenCalled();
        // Et surtout : rien n'y est supprimé.
        expect(prisma[table].deleteMany).not.toHaveBeenCalled();
      }
      expect(prisma.users.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
