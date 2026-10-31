'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type MyRoles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_HOME } from '@/lib/roles';

/**
 * QUI ES-TU DANS IGNITUX ?
 *
 * Posé après l'inscription, et modifiable ensuite : personne ne sait à
 * l'avance s'il investira un jour, et figer ce choix au premier écran
 * obligerait à recréer un compte pour changer d'avis.
 *
 * Deux choses que cet écran dit explicitement, parce qu'elles décident de
 * la confiance qu'on peut lui accorder :
 *
 * — Prendre un rôle ne crée rien, en retirer un n'efface rien. Un rôle est
 *   une vue.
 * — Les rôles à venir sont nommés, sans case à cocher. Les cacher
 *   laisserait croire qu'Ignitux ne les a pas prévus ; les ouvrir
 *   promettrait un espace qui n'existe pas.
 *
 * Au premier passage, « Entrepreneur » est déjà coché, et l'entrepreneur
 * va ensuite droit à la création de son premier projet.
 */
export default function RolesPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [mine, setMine] = useState<MyRoles | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    api
      .getMyRoles(token)
      .then((resultat) => {
        setMine(resultat);
        // Premier passage : « Entrepreneur » est déjà coché. C'est le choix
        // de presque tout le monde ici, et un bouton grisé tant qu'on n'a pas
        // deviné qu'il faut cocher une case est une marche de trop.
        const entrepreneurOuvert = resultat.catalogue.some((r) => r.id === 'entrepreneur' && r.available);
        setSelection(
          resultat.roles.length === 0 && entrepreneurOuvert ? ['entrepreneur'] : resultat.roles,
        );
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de lire tes rôles.'),
      )
      .finally(() => setIsLoading(false));
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  function basculer(roleId: string) {
    setConfirmation(null);
    setSelection((precedente) =>
      precedente.includes(roleId)
        ? precedente.filter((id) => id !== roleId)
        : [...precedente, roleId],
    );
  }

  async function enregistrer() {
    if (!token) return;
    setError(null);
    setConfirmation(null);
    setIsSaving(true);
    try {
      const misAJour = await api.setMyRoles(token, selection);
      setMine(misAJour);
      setSelection(misAJour.roles);
      setConfirmation('Tes rôles sont enregistrés.');
      // Premier passage (juste après l'inscription) : un entrepreneur va
      // droit à son premier projet — c'est là qu'IGINI commence à servir ;
      // les autres entrent sur leur bureau. Ensuite, on laisse la personne
      // où elle est : elle est venue régler quelque chose.
      if ((mine?.roles.length ?? 0) === 0 && misAJour.activeRole) {
        router.push(misAJour.roles.includes('entrepreneur') ? '/projects' : '/accueil');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "L'enregistrement a échoué.");
      // Le serveur a refuse : les cases doivent revenir a ce qui est vrai.
      // Laisser la selection refusee a l ecran ferait croire que le
      // changement a eu lieu, alors que rien n a bouge en base.
      if (mine) setSelection(mine.roles);
    } finally {
      setIsSaving(false);
    }
  }

  const premierChoix = (mine?.roles.length ?? 0) === 0;
  const inchange =
    selection.length === (mine?.roles.length ?? 0) &&
    selection.every((role) => mine?.roles.includes(role as never));

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        {!premierChoix && mine?.activeRole && (
          <Link href={ROLE_HOME[mine.activeRole] ?? '/projects'} className="muted">
            ← Retour à mon espace
          </Link>
        )}
      </div>

      <h1>{premierChoix ? "Qui es-tu aujourd'hui ?" : 'Mes rôles'}</h1>

      <p className="muted">
        Ton rôle décide de ce qu&apos;Ignitux te montre. Tu peux en changer quand tu veux :
        rien n&apos;est créé ni effacé.
      </p>

      {error && <p className="error">{error}</p>}
      {confirmation && <p className="notice"><span>{confirmation}</span></p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {mine?.suggestions.map((suggestion) => (
        <p className="notice" key={suggestion.role}>
          <span>
            {suggestion.detail}. Prendre le rôle correspondant te donnera accès à ces
            données — elles existent déjà, elles ne sont simplement pas affichées.
          </span>
        </p>
      ))}

      {/* Les rôles ouverts, et ceux qu'on tient déjà, en cartes à cocher. */}
      {mine?.catalogue.filter((role) => role.available || mine.roles.includes(role.id)).map((role) => {
        const coche = selection.includes(role.id);
        return (
          <div
            className="card"
            key={role.id}
            style={{ marginTop: '1rem', opacity: role.available ? 1 : 0.6 }}
          >
            <label
              htmlFor={`role-${role.id}`}
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: role.available ? 'pointer' : 'default' }}
            >
              <input
                id={`role-${role.id}`}
                type="checkbox"
                checked={coche}
                disabled={!role.available || isSaving}
                onChange={() => basculer(role.id)}
                style={{ marginTop: '0.3rem', width: 'auto' }}
              />
              <span>
                <strong>{role.label}</strong>
                <span className="muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                  {role.summary}
                </span>
                {!role.available && (
                  <span className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                    Pas encore ouvert : aucun espace n&apos;existe derrière pour l&apos;instant.
                  </span>
                )}
              </span>
            </label>
          </div>
        );
      })}

      {/* Les rôles à venir, sur une ligne : les cacher laisserait croire
          qu'Ignitux ne les a pas prévus, les mettre en cartes grisées
          allongeait l'écran pour rien. L'administration n'est pas un rôle
          « à venir » pour le public : elle n'y figure pas. */}
      {(() => {
        const aVenir =
          mine?.catalogue.filter(
            (role) => !role.available && !mine.roles.includes(role.id) && role.id !== 'administrateur',
          ) ?? [];
        return aVenir.length > 0 ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            Bientôt : {aVenir.map((role) => role.label).join(', ')} — pas encore ouverts.
          </p>
        ) : null;
      })()}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className="primary"
          type="button"
          onClick={() => void enregistrer()}
          disabled={isSaving || selection.length === 0 || inchange}
        >
          {isSaving ? 'Enregistrement…' : premierChoix ? 'Continuer' : 'Enregistrer'}
        </button>
        {selection.length === 0 && (
          <span className="muted" style={{ alignSelf: 'center' }}>
            Garde au moins un rôle : sans rôle, Ignitux ne saurait plus quoi te montrer.
          </span>
        )}
      </div>
    </main>
  );
}
