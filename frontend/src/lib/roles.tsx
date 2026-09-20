'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type MyRoles, type RoleId } from '@/lib/api';

/** La page d'accueil de chaque espace, côté client. */
export const ROLE_HOME: Record<string, string> = {
  entrepreneur: '/projects',
  investisseur: '/investisseur',
};

export const ROLE_LABEL: Record<string, string> = {
  entrepreneur: 'Entrepreneur',
  investisseur: 'Investisseur',
  mentor: 'Mentor',
  expert: 'Expert',
  partenaire: 'Partenaire',
  administrateur: 'Administrateur',
};

/**
 * Les rôles de la personne connectée.
 *
 * Le serveur reste seul juge : ce hook lit, il ne décide pas. Un espace
 * refusé ici le serait de toute façon par le garde côté serveur, et c'est
 * l'ordre voulu — le frontend range l'interface, il ne tient pas la porte.
 *
 * @param espace Le role dont cette page EST l espace, quand elle en est un.
 *   Arriver sur /investisseur par un lien ou un signet alors que le mode
 *   enregistre dit « Entrepreneur » afficherait un selecteur qui contredit
 *   la page. On aligne le mode sur l espace ou la personne se trouve
 *   reellement — a condition qu elle tienne ce role, sinon le serveur a
 *   deja refuse la page.
 */
export function useRoles(token: string | null, espace?: RoleId) {
  const [roles, setRoles] = useState<MyRoles | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) {
      setRoles(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setRoles(await api.getMyRoles(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de lire tes rôles.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!token || !espace || !roles) return;
    // Une reponse malformee — serveur d une version anterieure — ne doit pas
    // casser la page : on renonce a aligner, le reste continue.
    if (!Array.isArray(roles.roles)) return;
    if (roles.activeRole === espace) return;
    if (!roles.roles.includes(espace)) return;
    api
      .setActiveRole(token, espace)
      .then(setRoles)
      // Un alignement de confort : s il echoue, la page reste utilisable.
      .catch(() => undefined);
  }, [token, espace, roles]);

  const switchTo = useCallback(
    async (role: RoleId) => {
      if (!token) return null;
      const mis = await api.setActiveRole(token, role);
      setRoles(mis);
      return mis;
    },
    [token],
  );

  return { roles, isLoading, error, reload, switchTo };
}
