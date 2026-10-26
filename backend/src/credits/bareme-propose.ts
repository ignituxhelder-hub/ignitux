import { estGenerateur, GENERATOR_NAMES, type GeneratorName } from '../igini/usage/generator-names.js';
import { BAREME, creditsPourCout } from './bareme.js';

/**
 * LE BARÈME PROPOSÉ À PARTIR DES APPELS RÉELS — le calcul de
 * `scripts/bareme-credits.mjs`, pur pour être testé.
 *
 * Pour chaque générateur : le coût moyen d'un appel sur la période, le prix
 * que la règle en tire (`creditsPourCout`), et l'écart avec la table en code.
 * Le script ne change rien : il montre, Helder décide.
 *
 * Le chat se paie au message, mais un message fait jusqu'à trois tours, donc
 * trois lignes `discuter` dans le journal. Son coût moyen se calcule donc par
 * message (nombre de messages envoyés sur la période) quand on le connaît, et
 * par ligne sinon — ce qui le sous-estime, et la ligne le dit.
 *
 * ## Deux noms partagés jusqu'au 2026-10-25
 *
 * Avant les crédits, les statuts se journalisaient sous « former » et la
 * conformité sous « executer ». Une moyenne qui les mêle surestime ces deux
 * prix. Le script passe donc, pour chacun, la date du premier appel
 * journalisé sous le nouveau nom (`statuts`, `conformite`) : les lignes
 * d'avant sont écartées, et la ligne le dit. Sans aucun appel sous le nouveau
 * nom, rien ne permet de séparer : tout est écarté.
 */

/** L'ancien nom → le générateur qui s'y journalisait aussi jusqu'au 2026-10-25. */
export const NOMS_PARTAGES = { former: 'statuts', executer: 'conformite' } as const;
type NomPartage = keyof typeof NOMS_PARTAGES;
const LIBELLE_SEPARE: Record<NomPartage, string> = { former: 'les statuts', executer: 'la conformité' };

export interface AppelMesure {
  generator: string;
  /** Coût de l'appel en micro-euros ; `null` si son modèle échappe à la grille. */
  coutMicroEur: number | null;
  /** Quand l'appel a eu lieu — sert à écarter les noms partagés (voir NOMS_PARTAGES). */
  quand?: Date | null;
}

export interface LigneProposee {
  generateur: string;
  /** Lignes du journal prises en compte (tarifées). */
  appels: number;
  /** Lignes ignorées faute de tarif pour leur modèle. */
  nonTarifes: number;
  /** Lignes écartées parce qu'elles datent d'avant la séparation des noms (former, executer). */
  ecartesAvantSeparation: number;
  /** Le diviseur réellement utilisé : appels, ou messages pour le chat. */
  unites: number;
  coutMoyenMicroEur: number | null;
  creditsProposes: number | null;
  actuel: { credits: number; coutReferenceMicroEur: number } | null;
  /** creditsProposes − credits actuels ; null sans mesure ou sans ligne au barème. */
  ecartCredits: number | null;
  remarque: string | null;
}

/** En dessous, une moyenne est une anecdote : on la montre, avec un avertissement. */
export const ECHANTILLON_MINIMUM = 5;

export function proposerBareme(
  appels: ReadonlyArray<AppelMesure>,
  options: {
    messagesChat?: number;
    /**
     * Pour « former » et « executer » : le premier appel journalisé sous le
     * nouveau nom (`statuts`, `conformite`). Ce qui précède est écarté ;
     * `null` (ou absent quand l'objet est fourni) écarte tout. Sans l'objet,
     * rien n'est écarté.
     */
    separations?: Partial<Record<NomPartage, Date | null>>;
  } = {},
): LigneProposee[] {
  const parGenerateur = new Map<string, { total: number; appels: number; nonTarifes: number; ecartes: number }>();
  for (const appel of appels) {
    const ligne = parGenerateur.get(appel.generator) ?? { total: 0, appels: 0, nonTarifes: 0, ecartes: 0 };
    parGenerateur.set(appel.generator, ligne);
    if (avantSeparation(appel, options.separations)) {
      ligne.ecartes += 1;
      continue;
    }
    if (appel.coutMicroEur === null) ligne.nonTarifes += 1;
    else {
      ligne.total += appel.coutMicroEur;
      ligne.appels += 1;
    }
    parGenerateur.set(appel.generator, ligne);
  }

  // Tous les générateurs du barème, même sans appel, puis les inconnus.
  const noms = [...GENERATOR_NAMES, ...[...parGenerateur.keys()].filter((n) => !estGenerateur(n)).sort()];

  return noms.map((generateur) => {
    const mesure = parGenerateur.get(generateur) ?? { total: 0, appels: 0, nonTarifes: 0, ecartes: 0 };
    const auBareme = estGenerateur(generateur) ? BAREME[generateur as GeneratorName] : null;
    const parMessage = generateur === 'discuter' && (options.messagesChat ?? 0) > 0;
    const unites = parMessage ? (options.messagesChat as number) : mesure.appels;
    const coutMoyen = unites > 0 && mesure.appels > 0 ? Math.round(mesure.total / unites) : null;
    const proposes = coutMoyen === null ? null : creditsPourCout(coutMoyen);

    const remarques: string[] = [];
    if (!auBareme) remarques.push('absent du barème : aucun prix, à ajouter');
    if (mesure.ecartes > 0 && estNomPartage(generateur)) {
      const nouveau = NOMS_PARTAGES[generateur];
      remarques.push(
        options.separations?.[generateur]
          ? `${mesure.ecartes} appel(s) d’avant la séparation écarté(s) (« ${generateur} » comptait aussi ${LIBELLE_SEPARE[generateur]})`
          : `${mesure.ecartes} appel(s) écarté(s) : aucun appel « ${nouveau} » encore journalisé, impossible de séparer ` +
              `${LIBELLE_SEPARE[generateur]} — à relancer plus tard`,
      );
    }
    if (mesure.appels === 0) remarques.push('aucun appel mesuré sur la période');
    else if (mesure.appels < ECHANTILLON_MINIMUM) remarques.push(`seulement ${mesure.appels} appel(s) : moyenne fragile`);
    if (mesure.nonTarifes > 0) remarques.push(`${mesure.nonTarifes} appel(s) d’un modèle hors grille, ignoré(s)`);
    if (generateur === 'discuter' && mesure.appels > 0) {
      remarques.push(parMessage ? `par message (${unites} messages)` : 'par tour, faute du nombre de messages : sous-estimé');
    }

    return {
      generateur,
      appels: mesure.appels,
      nonTarifes: mesure.nonTarifes,
      ecartesAvantSeparation: mesure.ecartes,
      unites,
      coutMoyenMicroEur: coutMoyen,
      creditsProposes: proposes,
      actuel: auBareme ? { credits: auBareme.credits, coutReferenceMicroEur: auBareme.coutReferenceMicroEur } : null,
      ecartCredits: proposes !== null && auBareme ? proposes - auBareme.credits : null,
      remarque: remarques.length > 0 ? remarques.join(' ; ') : null,
    };
  });
}

function estNomPartage(generateur: string): generateur is NomPartage {
  return Object.hasOwn(NOMS_PARTAGES, generateur);
}

/** Un appel « former » ou « executer » qui date d'avant la séparation des noms. */
function avantSeparation(appel: AppelMesure, separations: Partial<Record<NomPartage, Date | null>> | undefined): boolean {
  if (!separations || !estNomPartage(appel.generator)) return false;
  const depuis = separations[appel.generator] ?? null;
  if (depuis === null) return true;
  return !appel.quand || appel.quand < depuis;
}
