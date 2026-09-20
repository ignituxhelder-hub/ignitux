'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, type MyRoles, type RoleId } from '@/lib/api';
import { ROLE_HOME, ROLE_LABEL } from '@/lib/roles';

/**
 * LE SÉLECTEUR DE MODE.
 *
 * Il n'apparaît que s'il a quelque chose à dire. Une personne qui ne tient
 * qu'un rôle n'a pas besoin qu'on lui rappelle lequel : lui montrer un
 * sélecteur à une option serait du bruit qui ressemble à un choix.
 *
 * Basculer ne déplace aucune donnée et n'en cache aucune : les projets
 * restent des projets, les investissements restent des investissements. Le
 * mode décide de ce qui est montré, jamais de ce qui existe.
 */
export function RoleBar({
  roles,
  onSwitch,
}: {
  roles: MyRoles | null;
  onSwitch: (role: RoleId) => Promise<MyRoles | null>;
}) {
  const router = useRouter();
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une reponse inattendue — serveur d une version anterieure, reponse
  // tronquee — ne doit pas blanchir la page qui porte ce selecteur. Le
  // bandeau disparait, le reste de l espace continue de fonctionner.
  if (!roles || !Array.isArray(roles.catalogue)) return null;

  const tenus = roles.catalogue.filter((role) => role.held);
  const suggestions = Array.isArray(roles.suggestions) ? roles.suggestions : [];

  // Un rôle non pris pour lequel des données existent déjà : le porteur d'un
  // projet a pu enregistrer un apport avant que la personne n'ait rien coché.
  // On le lui dit, on ne le lui accorde pas d'office.
  const suggestion = suggestions[0];

  // Les comptes anterieurs aux roles n en tiennent aucun. On ne detourne
  // pas leur navigation pour autant : la question est posee la ou ils sont,
  // et l espace continue de fonctionner tant qu ils n y repondent pas.
  if (tenus.length === 0) {
    return (
      <p className="notice" style={{ marginBottom: '1rem' }}>
        <span>
          Tu n&apos;as pas encore dit qui tu es dans Ignitux — entrepreneur, investisseur,
          ou les deux. <Link href="/roles">Le choisir</Link> ne déplacera aucune de tes
          données : cela décide seulement de ce qui t&apos;est montré.
        </span>
      </p>
    );
  }

  if (tenus.length < 2) {
    if (!suggestion) return null;
    return (
      <p className="notice" style={{ marginBottom: '1rem' }}>
        <span>
          {suggestion.detail}. Tu peux ouvrir ton espace{' '}
          {ROLE_LABEL[suggestion.role] ?? suggestion.role} depuis{' '}
          <Link href="/roles">tes rôles</Link> — rien ne sera déplacé.
        </span>
      </p>
    );
  }

  async function basculer(role: RoleId) {
    setError(null);
    setIsSwitching(true);
    try {
      await onSwitch(role);
      router.push(ROLE_HOME[role] ?? '/projects');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bascule impossible.');
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        role="group"
        aria-label="Mode actuel"
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Mode actuel
        </span>
        {tenus.map((role) => {
          const actif = roles.activeRole === role.id;
          return (
            <button
              key={role.id}
              type="button"
              className={actif ? 'primary' : 'secondary'}
              aria-pressed={actif}
              disabled={isSwitching || actif}
              onClick={() => void basculer(role.id)}
            >
              {role.label}
            </button>
          );
        })}
        <Link href="/roles" className="muted" style={{ fontSize: '0.8rem' }}>
          Gérer mes rôles
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
