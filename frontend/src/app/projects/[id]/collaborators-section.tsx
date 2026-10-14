'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type ActiviteEquipe,
  type Collaborator,
  type MembreAccesArgent,
  type RaisonAccesArgent,
} from '@/lib/api';
import { libelleRoles } from '@/lib/domaines';
import {
  ROLE_EQUIPE_DESCRIPTION,
  ROLE_EQUIPE_LABEL,
  ROLES_EQUIPE,
  type RoleEquipe,
} from '@/lib/equipe';

interface CollaboratorsSectionProps {
  token: string | null;
  projectId: string;
  /** Le propriétaire gère l'équipe ; un membre la voit seulement. */
  peutGerer?: boolean;
}

/**
 * L'ÉQUIPE DU PROJET — inviter avec un rôle, changer un rôle, retirer.
 *
 * Le serveur revérifie chaque action : cette section n'affiche les commandes
 * qu'au propriétaire, par confort.
 */
export function CollaboratorsSection({ token, projectId, peutGerer = true }: CollaboratorsSectionProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleEquipe>('observateur');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Change à chaque invitation, changement de rôle ou retrait réussi : l'accès
  // à mon argent en dépend, il est alors relu.
  const [versionEquipe, setVersionEquipe] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIsLoading(true);
    api
      .listCollaborators(token, projectId)
      .then((data) => {
        if (!cancelled) setCollaborators(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!token || !email.trim()) return;
    setError(null);
    setIsAdding(true);
    try {
      const collaborator = await api.addCollaborator(token, projectId, email.trim(), role);
      setCollaborators((prev) => [...prev, collaborator]);
      setVersionEquipe((v) => v + 1);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce collaborateur.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRole(userId: string, nouveau: RoleEquipe) {
    if (!token) return;
    setError(null);
    const avant = collaborators;
    setCollaborators((prev) => prev.map((c) => (c.user_id === userId ? { ...c, role: nouveau } : c)));
    try {
      await api.changerRoleCollaborateur(token, projectId, userId, nouveau);
      setVersionEquipe((v) => v + 1);
    } catch (err) {
      setCollaborators(avant);
      setError(err instanceof ApiError ? err.message : 'Impossible de changer ce rôle.');
    }
  }

  async function handleRemove(userId: string) {
    if (!token) return;
    setError(null);
    setRemovingId(userId);
    try {
      await api.removeCollaborator(token, projectId, userId);
      setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
      setVersionEquipe((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de retirer ce collaborateur.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Équipe</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Chacun voit ce qu&apos;il doit voir. Ce qui engage l&apos;entreprise (actes juridiques, équipe,
        suppression du projet) reste au propriétaire.
      </p>
      {error && <p className="error">{error}</p>}

      {peutGerer && (
        <form onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="email"
              aria-label="Email du collaborateur à ajouter"
              placeholder="email@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ flex: 1, minWidth: '12rem' }}
            />
            <select
              aria-label="Rôle de la personne invitée"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleEquipe)}
            >
              {ROLES_EQUIPE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_EQUIPE_LABEL[r]}
                </option>
              ))}
            </select>
            <button className="secondary" type="submit" disabled={isAdding}>
              {isAdding ? 'Ajout…' : 'Inviter'}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {ROLE_EQUIPE_DESCRIPTION[role]} La personne doit déjà avoir un compte Ignitux ; elle
            reçoit un email.
          </p>
        </form>
      )}

      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && collaborators.length === 0 && (
        <p className="muted">Aucun collaborateur pour l&apos;instant.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {collaborators.map((c) => (
          <div className="top-bar" key={c.id} style={{ marginBottom: 0, gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>{c.user.email}</span>
            {peutGerer ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  aria-label={`Rôle de ${c.user.email}`}
                  value={c.role ?? 'observateur'}
                  onChange={(e) => void handleRole(c.user_id, e.target.value as RoleEquipe)}
                >
                  {ROLES_EQUIPE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_EQUIPE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => handleRemove(c.user_id)}
                  disabled={removingId === c.user_id}
                >
                  {removingId === c.user_id ? 'Retrait…' : 'Retirer'}
                </button>
              </div>
            ) : (
              <span className="muted">{ROLE_EQUIPE_LABEL[c.role ?? 'observateur']}</span>
            )}
          </div>
        ))}
      </div>

      {peutGerer && <AccesAMonArgent token={token} version={versionEquipe} />}
      {peutGerer && <ActiviteDeMonEquipe token={token} />}
    </div>
  );
}

const TITRE_ACCES = 'Accès à mon argent (facturation, compta, banque, caisse)';

/** La raison de chaque accès, en clair (voir backend/src/equipe/acces-argent.ts). */
const RAISON_ACCES: Record<RaisonAccesArgent, string> = {
  active_par_toi: 'Activé par toi',
  automatique: 'Automatique (invité à partir du 15/10/2026)',
  coupe_par_toi: 'Coupé par toi',
  a_activer: 'À activer — invité avant le changement',
};

/**
 * L'ACCÈS DE MON ÉQUIPE À MON ARGENT — chaque comptable ou associé de mes
 * projets, avec une case pour activer ou couper son accès à ma facturation,
 * ma comptabilité, ma banque et ma caisse, et la raison de l'état actuel.
 *
 * Aucun affichage anticipé : la case montre toujours ce que le serveur a
 * répondu (la liste relue après chaque choix). Activer demande une
 * confirmation ; couper, jamais (c'est le sens prudent). Le choix vaut pour
 * tout mon argent, quel que soit le projet où la personne travaille.
 */
function AccesAMonArgent({ token, version }: { token: string | null; version: number }) {
  const [membres, setMembres] = useState<MembreAccesArgent[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let annule = false;
    api
      .accesArgent(token)
      .then((data) => {
        if (annule) return;
        setMembres(data);
        setErreur(null);
      })
      .catch((err: unknown) => {
        if (!annule) {
          setErreur(err instanceof ApiError ? err.message : 'Impossible de lire l’accès de ton équipe à ton argent.');
        }
      });
    return () => {
      annule = true;
    };
  }, [token, version]);

  async function choisir(membre: MembreAccesArgent, acces: boolean) {
    if (!token || enCours !== null) return;
    if (
      acces &&
      !window.confirm(`${membre.nom} pourra voir et modifier ta facturation, ta compta, ta banque et ta caisse.`)
    ) {
      return;
    }
    setErreur(null);
    setEnCours(membre.memberId);
    try {
      setMembres(await api.choisirAccesArgent(token, membre.memberId, acces));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer ce choix.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section aria-labelledby="acces-argent-titre" style={{ marginTop: '1rem' }}>
      <h3 id="acces-argent-titre" style={{ marginBottom: '0.25rem' }}>
        {TITRE_ACCES}
      </h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Tes comptables et associés peuvent voir et modifier ta facturation, ta compta, ta banque et ta caisse.
        Ceux que tu as ajoutés à partir du 15/10/2026 y ont accès automatiquement ; ceux ajoutés avant n&apos;y
        ont accès que si tu l&apos;actives. Tu peux couper l&apos;accès de chacun à tout moment. Le choix vaut
        pour tous tes projets.
      </p>
      {erreur && <p className="error">{erreur}</p>}
      {membres === null && !erreur && <p className="loading">Chargement…</p>}
      {membres !== null && membres.length === 0 && (
        <p className="muted">Aucun comptable ni associé : personne d’autre que toi n’a accès à ton argent.</p>
      )}
      {membres !== null && membres.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {membres.map((membre) => {
            const id = `acces-argent-${membre.memberId}`;
            return (
              <li key={membre.memberId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  id={id}
                  checked={membre.acces}
                  disabled={enCours !== null}
                  aria-describedby={`${id}-raison`}
                  onChange={() => void choisir(membre, !membre.acces)}
                />
                <label htmlFor={id}>
                  {membre.nom} ({libelleRoles(membre.roles)})
                </label>
                <span id={`${id}-raison`} className="muted">
                  {RAISON_ACCES[membre.raison] ?? ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const TITRE_ACTIVITE = 'Activité de mon équipe dans mon argent';

function dateCourte(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'date inconnue'
    : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * LE JOURNAL DE MON ÉQUIPE — ce que mes comptables et associés ont écrit dans
 * ma facturation, ma comptabilité, ma banque et ma caisse (lecture seule).
 *
 * Replié par défaut et chargé seulement à l'ouverture : la section Équipe
 * reste telle quelle pour qui ne le cherche pas. Le journal est celui du
 * propriétaire, pas du projet : le même dans chacun de ses projets.
 */
function ActiviteDeMonEquipe({ token }: { token: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const [lignes, setLignes] = useState<ActiviteEquipe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || !token || lignes !== null) return;
    let annule = false;
    setErreur(null);
    api
      .activiteDeMonEquipe(token)
      .then((data) => {
        if (!annule) setLignes(data);
      })
      .catch((err: unknown) => {
        if (!annule) setErreur(err instanceof ApiError ? err.message : 'Impossible de lire l’activité de ton équipe.');
      });
    return () => {
      annule = true;
    };
  }, [ouvert, token, lignes]);

  return (
    <div style={{ marginTop: '1rem' }}>
      <button
        type="button"
        className="secondary"
        aria-expanded={ouvert}
        aria-controls="activite-equipe"
        onClick={() => setOuvert((o) => !o)}
      >
        {TITRE_ACTIVITE}
      </button>
      {ouvert && (
        <div id="activite-equipe" style={{ marginTop: '0.75rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Ce que tes comptables et associés ont écrit dans ta facturation, ta comptabilité, ta banque et ta
            caisse (les 200 dernières actions, conservées 12 mois). Le même journal dans chacun de tes projets.
          </p>
          {erreur && <p className="error">{erreur}</p>}
          {!erreur && lignes === null && <p className="loading">Chargement…</p>}
          {lignes !== null && lignes.length === 0 && (
            <p className="muted">Aucune activité de ton équipe dans ton argent pour l’instant.</p>
          )}
          {lignes !== null && lignes.length > 0 && (
            <ul aria-label={TITRE_ACTIVITE} style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {lignes.map((ligne, i) => (
                <li key={`${ligne.date ?? ''}-${i}`}>
                  {dateCourte(ligne.date)} — {ligne.acteur} — <code>{ligne.methode} {ligne.chemin}</code> —{' '}
                  {ligne.statut < 400 ? `réussie (${ligne.statut})` : `refusée (${ligne.statut})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
