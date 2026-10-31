import { ForbiddenException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CreditsInsuffisantsException } from '../credits/credits-insuffisants.js';
import { GENERATORS_DISABLED_MESSAGE } from '../igini/claude/generators-availability.js';
import { MESSAGE_ETAPE_ECHOUEE, EnchainementService } from './enchainement.service.js';
import type { ProjectsService } from './projects.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

let interrupteur: string | undefined;
vi.mock('../config/env.js', () => ({ getEnv: () => ({ IGINI_AI_ENABLED: interrupteur }) }));

const TABLES = ['analyses', 'legal_form_recommendations', 'build_plans', 'financing_plans', 'development_plans'] as const;

/** Laisse les promesses détachées (l'enchaînement) avancer jusqu'au bout. */
async function laisserTourner() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe('EnchainementService', () => {
  let faits: Record<(typeof TABLES)[number], number>;
  let prisma: Record<string, unknown>;
  let projets: Record<string, ReturnType<typeof vi.fn>>;
  let service: EnchainementService;
  let ordre: string[];

  beforeEach(() => {
    interrupteur = undefined;
    ordre = [];
    faits = { analyses: 0, legal_form_recommendations: 0, build_plans: 0, financing_plans: 0, development_plans: 0 };
    prisma = {
      projects: { findFirst: vi.fn().mockResolvedValue({ owner_id: 'u1', collaborators: [] }) },
      ...Object.fromEntries(
        TABLES.map((table) => [table, { count: vi.fn(() => Promise.resolve(faits[table])) }]),
      ),
    };
    // Chaque étape réussie écrit sa ligne : la base dit ensuite qu'elle est faite.
    const etape = (nom: string, table: (typeof TABLES)[number]) =>
      vi.fn(() => {
        ordre.push(nom);
        faits[table] += 1;
        return Promise.resolve({ id: nom });
      });
    projets = {
      analyzeForOwner: etape('analyser', 'analyses'),
      recommendLegalFormForOwner: etape('former', 'legal_form_recommendations'),
      createBuildPlanForOwner: etape('construire', 'build_plans'),
      createFinancingPlanForOwner: etape('financer', 'financing_plans'),
      createDevelopmentPlanForOwner: etape('developper', 'development_plans'),
    };
    service = new EnchainementService(
      prisma as unknown as PrismaService,
      projets as unknown as ProjectsService,
    );
  });

  it('enchaîne les cinq étapes dans l’ordre, au nom de la personne qui a cliqué', async () => {
    const vue = await service.lancer('u1', 'p1');
    expect(vue.statut).toBe('en-cours');
    expect(vue.etapes[0]).toMatchObject({ id: 'analyser', etat: 'en-cours' });

    await laisserTourner();

    expect(ordre).toEqual(['analyser', 'former', 'construire', 'financer', 'developper']);
    expect(projets.analyzeForOwner).toHaveBeenCalledWith('u1', 'p1');
    expect(projets.createDevelopmentPlanForOwner).toHaveBeenCalledWith('u1', 'p1');
    const fin = await service.voir('u1', 'p1');
    expect(fin.statut).toBe('termine');
    expect(fin.creditsRestants).toBe(0);
  });

  it('annonce le prix des cinq étapes avant le clic : 21 crédits', async () => {
    const vue = await service.voir('u1', 'p1');
    expect(vue.statut).toBe('pret');
    expect(vue.etapes.map((e) => [e.id, e.credits])).toEqual([
      ['analyser', 4],
      ['former', 4],
      ['construire', 5],
      ['financer', 4],
      ['developper', 4],
    ]);
    expect(vue.creditsRestants).toBe(21);
  });

  it('ne refait ni ne refait payer ce qui existe déjà', async () => {
    faits.analyses = 1;
    faits.legal_form_recommendations = 1;

    const vue = await service.lancer('u1', 'p1');
    expect(vue.creditsRestants).toBe(13);
    await laisserTourner();

    expect(ordre).toEqual(['construire', 'financer', 'developper']);
  });

  it('saute une étape lancée entre-temps depuis son propre bouton', async () => {
    projets.analyzeForOwner.mockImplementation(() => {
      ordre.push('analyser');
      faits.analyses += 1;
      faits.legal_form_recommendations += 1; // la forme juridique, lancée à la main pendant l'analyse
      return Promise.resolve({});
    });

    await service.lancer('u1', 'p1');
    await laisserTourner();

    expect(projets.recommendLegalFormForOwner).not.toHaveBeenCalled();
    expect(ordre).toEqual(['analyser', 'construire', 'financer', 'developper']);
  });

  it('s’arrête net quand les crédits manquent, et dit pourquoi avec le lien vers les crédits', async () => {
    projets.createBuildPlanForOwner.mockRejectedValue(new CreditsInsuffisantsException(5, 2));
    const journal = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await service.lancer('u1', 'p1');
    await laisserTourner();

    expect(ordre).toEqual(['analyser', 'former']);
    expect(projets.createFinancingPlanForOwner).not.toHaveBeenCalled();
    const vue = await service.voir('u1', 'p1');
    expect(vue.statut).toBe('arrete');
    expect(vue.arret).toEqual({
      etape: 'construire',
      message: 'Crédits insuffisants : il te faut 5 crédits, tu en as 2.',
      voirCredits: true,
    });
    expect(vue.etapes.find((e) => e.id === 'construire')?.etat).toBe('a-faire');
    // Un refus n'est pas une panne.
    expect(journal).not.toHaveBeenCalled();
    journal.mockRestore();
  });

  it('relancer après un arrêt reprend à l’étape manquante', async () => {
    projets.createBuildPlanForOwner.mockRejectedValueOnce(new CreditsInsuffisantsException(5, 2));
    await service.lancer('u1', 'p1');
    await laisserTourner();

    ordre = [];
    await service.lancer('u1', 'p1');
    await laisserTourner();

    expect(ordre).toEqual(['construire', 'financer', 'developper']);
    expect((await service.voir('u1', 'p1')).statut).toBe('termine');
  });

  it('une vraie panne s’arrête aussi, se journalise, et rassure sur le débit', async () => {
    projets.recommendLegalFormForOwner.mockRejectedValue(new Error('réseau'));
    const journal = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await service.lancer('u1', 'p1');
    await laisserTourner();

    const vue = await service.voir('u1', 'p1');
    expect(vue.arret).toEqual({ etape: 'former', message: MESSAGE_ETAPE_ECHOUEE, voirCredits: false });
    expect(journal).toHaveBeenCalled();
    journal.mockRestore();
  });

  it('un second clic pendant que ça tourne ne lance rien de plus', async () => {
    let finirAnalyse: () => void = () => {};
    projets.analyzeForOwner.mockImplementation(
      () =>
        new Promise((resolve) => {
          finirAnalyse = () => {
            faits.analyses += 1;
            resolve({});
          };
        }),
    );

    await service.lancer('u1', 'p1');
    await laisserTourner();
    const deuxieme = await service.lancer('u1', 'p1');

    expect(deuxieme.statut).toBe('en-cours');
    expect(projets.analyzeForOwner).toHaveBeenCalledTimes(1);
    finirAnalyse();
    await laisserTourner();
  });

  it('IGINI en pause : refus immédiat, avec la phrase habituelle, et rien ne démarre', async () => {
    interrupteur = 'false';

    await expect(service.lancer('u1', 'p1')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.lancer('u1', 'p1')).rejects.toThrow(GENERATORS_DISABLED_MESSAGE);
    expect(projets.analyzeForOwner).not.toHaveBeenCalled();
  });

  it('un rôle qui ne permet pas de lancer IGINI est refusé avant tout', async () => {
    (prisma.projects as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      owner_id: 'u2',
      collaborators: [{ role: 'observateur' }],
    });

    await expect(service.lancer('u1', 'p1')).rejects.toThrow(ForbiddenException);
    expect(projets.analyzeForOwner).not.toHaveBeenCalled();
  });

  it('le projet d’un autre reste introuvable', async () => {
    (prisma.projects as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);

    await expect(service.voir('u1', 'p1')).rejects.toThrow(NotFoundException);
  });
});
