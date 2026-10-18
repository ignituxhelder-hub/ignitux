/**
 * POUR LES TESTS SEULEMENT (exclu du build, voir tsconfig.build.json).
 *
 * Une fausse équipe de projet qui évalue VRAIMENT la règle de visibilité de
 * `acces-projet.ts` : le filtre `projetVisiblePar(userId)` posé sur une
 * lecture, et la lecture d'`accesProjet` (`{ id, OR: [...] }`). Une lecture
 * qui oublie le filtre trouve la ligne d'un autre — et le test qui compare
 * « elle existe » et « elle n'existe pas » le voit.
 *
 * Toute autre forme de filtre fait échouer le test plutôt que d'être
 * devinée : une fausse base qui accepte n'importe quoi ne prouve rien.
 */

export interface ProjetFaux {
  id: string;
  owner_id: string;
}

export interface MembreFaux {
  project_id: string;
  user_id: string;
  role: string;
}

export function fausseEquipe(projets: ProjetFaux[], membres: MembreFaux[]) {
  /** La personne d'un filtre `projetVisiblePar`, et de ce filtre seul. */
  const personneDu = (filtre: unknown): string => {
    const userId = (filtre as { OR?: [{ owner_id?: string }] } | undefined)?.OR?.[0]?.owner_id;
    const attendu = { OR: [{ owner_id: userId }, { collaborators: { some: { user_id: userId } } }] };
    if (!userId || JSON.stringify(filtre) !== JSON.stringify(attendu)) {
      throw new Error(`Filtre de projet non géré par la fausse équipe : ${JSON.stringify(filtre)}`);
    }
    return userId;
  };

  /** Mes rôles sur ce projet, ou `null` si je n'en suis ni propriétaire ni membre. */
  const equipeSur = (projectId: unknown, userId: string) => {
    const projet = projets.find((p) => p.id === projectId);
    if (!projet) return null;
    const roles = membres.filter((m) => m.project_id === projet.id && m.user_id === userId).map((m) => m.role);
    return projet.owner_id === userId || roles.length > 0 ? { projet, roles } : null;
  };

  return {
    personneDu,
    /**
     * La ligne de ce projet passe-t-elle le filtre de la lecture ? Sans
     * filtre, oui — c'est précisément ce qui trahissait son existence.
     */
    visible: (projectId: unknown, filtre: unknown) =>
      filtre === undefined || equipeSur(projectId, personneDu(filtre)) !== null,
    /** `projects.findFirst` tel qu'`accesProjet` l'appelle. */
    lectureAccesProjet: async ({ where }: { where: { id: string; OR?: unknown } }) => {
      const { id, ...filtre } = where;
      const equipe = equipeSur(id, personneDu(filtre));
      return equipe && { owner_id: equipe.projet.owner_id, collaborators: equipe.roles.map((role) => ({ role })) };
    },
  };
}

/** Le refus d'une promesse qui devait échouer — ou un échec du test si elle a réussi. */
export function refus(promesse: Promise<unknown>): Promise<Error & { getResponse?: () => unknown; getStatus?: () => number }> {
  return promesse.then(
    () => {
      throw new Error('la requête aurait dû être refusée');
    },
    (e: unknown) => e as Error,
  );
}

/** Le nombre total d'appels reçus par tous les faux d'une fausse base. */
export function requetes(base: object): number {
  return Object.values(base as Record<string, Record<string, { mock?: { calls: unknown[] } }>>)
    .flatMap((table) => Object.values(table))
    .reduce((total, fn) => total + (fn.mock?.calls.length ?? 0), 0);
}
