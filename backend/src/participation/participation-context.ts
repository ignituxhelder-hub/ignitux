import { buildCapTable } from '../financing/financing-model.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * CE QU'IGINI SAIT DE LA PARTICIPATION D'IGNITUX.
 *
 * IGINI recommande des tâches et rédige des plans. Pour qu'une recommandation
 * « Financer » ou « Transmettre » aille vers le prochain palier plutôt que de
 * l'ignorer, il lui faut savoir où en est l'accord et ce que dit le palier
 * suivant. Ce module le lui dit — et lui dit aussi ce qu'il ne doit pas faire :
 * promettre une date, ou valider quoi que ce soit.
 *
 * Il n'invente rien : les conditions viennent de ce que les personnes ont écrit
 * pour ce projet, et leur absence est dite telle quelle.
 */

export interface ParticipationContextInput {
  founderBasisPoints: number | null;
  ignituxBasisPoints: number | null;
  /** 'actif' | 'transmis' | 'clos' */
  status: string;
  dividendRightBasisPoints: number;
  nextMilestone: {
    position: number;
    label: string | null;
    targetIgnituxBasisPoints: number;
    status: string;
    conditions: string[];
  } | null;
}

/** 5100 → « 51 % », 8750 → « 87,5 % ». */
function pct(basisPoints: number): string {
  return `${String(basisPoints / 100).replace('.', ',')} %`;
}

export function contexteParticipation(input: ParticipationContextInput): string | undefined {
  // Sans capital connu, on ne raconte rien : mieux vaut aucun contexte
  // qu'une répartition inventée.
  if (input.founderBasisPoints === null || input.ignituxBasisPoints === null) return undefined;

  const lignes = [
    `PARTICIPATION IGNITUX : le capital est actuellement réparti ${pct(input.founderBasisPoints)} porteur / ` +
      `${pct(input.ignituxBasisPoints)} IGNITUX.`,
  ];

  if (input.ignituxBasisPoints === 0) {
    lignes.push(
      "Le capital est entièrement transmis au porteur. IGNITUX conserve, séparément du capital, un " +
        `droit de ${pct(input.dividendRightBasisPoints)} des dividendes effectivement distribués ` +
        "(ce n'est pas une part de capital, ni du chiffre d'affaires, ni du bénéfice), et le porteur " +
        "garde l'accès à l'écosystème IGNITUX selon son accord. Sans dividende distribué, rien n'est dû.",
    );
  } else if (input.nextMilestone) {
    const { position, label, targetIgnituxBasisPoints, status, conditions } = input.nextMilestone;
    const intitule = label ? `palier ${position} (« ${label} »)` : `palier ${position}`;
    lignes.push(
      `Prochain ${intitule} : la part d'IGNITUX passerait à ${pct(targetIgnituxBasisPoints)} ` +
        `(statut : ${status === 'valide' ? 'validé par IGNITUX, à exécuter' : 'prévu, non validé'}).`,
    );
    lignes.push(
      conditions.length > 0
        ? `Conditions définies pour ce projet : ${conditions.join(' ; ')}.`
        : "Conditions de ce palier : à définir par IGNITUX — aucune n'est connue, n'en invente pas.",
    );
  }

  lignes.push(
    "Un palier n'est jamais déclenché par le temps : n'annonce aucune date ni aucune durée pour " +
      "l'atteindre. Seul IGNITUX le valide, quand les conditions de ce projet sont remplies ; tu peux " +
      'aider le porteur à préparer ces conditions, pas à les déclarer remplies.',
  );

  return lignes.join('\n');
}

/**
 * Charge le contexte d'un projet. Renvoie undefined s'il n'a pas d'accord.
 *
 * L'échec est avalé, comme pour le profil de la personne : une génération ne
 * doit pas échouer parce que la participation n'a pas pu être lue. Elle sera
 * simplement moins bien renseignée.
 */
export async function chargerContexteParticipation(
  prisma: PrismaService,
  projectId: string,
): Promise<string | undefined> {
  try {
    const agreement = await prisma.participation_agreements.findFirst({ where: { project_id: projectId } });
    if (!agreement) return undefined;

    const [events, milestones] = await Promise.all([
      prisma.equity_events.findMany({ where: { project_id: projectId } }),
      prisma.participation_milestones.findMany({
        where: { agreement_id: agreement.id },
        orderBy: { position: 'asc' },
      }),
    ]);

    const capital = buildCapTable(
      [
        { id: agreement.founder_holder_id, name: '', is_founder: true },
        { id: agreement.ignitux_holder_id, name: '', is_founder: false },
      ],
      events,
    );
    const next = milestones.find((m) => m.status === 'prevu' || m.status === 'valide');

    return contexteParticipation({
      founderBasisPoints: capital.holders.find((h) => h.isFounder)?.shareBasisPoints ?? null,
      ignituxBasisPoints: capital.holders.find((h) => !h.isFounder)?.shareBasisPoints ?? null,
      status: agreement.status,
      dividendRightBasisPoints: agreement.dividend_right_bps,
      nextMilestone: next
        ? {
            position: next.position,
            label: next.label,
            targetIgnituxBasisPoints: next.target_ignitux_bps,
            status: next.status,
            conditions: next.conditions,
          }
        : null,
    });
  } catch {
    return undefined;
  }
}
