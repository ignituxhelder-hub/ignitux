'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { RoleBar } from '@/components/role-bar';
import { api, ApiError, type InvestorSpace } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoles } from '@/lib/roles';

/** Centimes → euros, sans jamais passer par un flottant intermédiaire. */
function euros(cents: number): string {
  const signe = cents < 0 ? '-' : '';
  const absolu = Math.abs(cents);
  const entiers = String(Math.floor(absolu / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${entiers},${String(absolu % 100).padStart(2, '0')} €`;
}

/** Points de base → pourcentage. 1000 = 10 %. */
function pourcentage(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} %`;
}

const STATUTS: Record<string, string> = {
  ouvert: 'Ouvert au financement',
  finance: 'Financé',
  en_remboursement: 'En remboursement',
  solde: 'Soldé',
  arrete: 'Arrêté',
};

/**
 * L'ESPACE INVESTISSEUR.
 *
 * Il ne montre que de l'argent qui a réellement bougé. Aucun rendement
 * prévisionnel, aucune valorisation, aucune projection : ce sont les trois
 * chiffres qu'un tableau de bord d'investissement affiche d'habitude, et les
 * trois qu'Ignitux ne peut pas produire honnêtement.
 *
 * Les projets ne se compensent pas entre eux. Chaque ligne totalise ses
 * propres mouvements, et le total global est la somme des lignes — pas un
 * chiffre calculé à part qui finirait par en différer.
 */
export default function InvestorSpacePage() {
  const { token, user, isReady, logout } = useAuth();
  const router = useRouter();
  const { roles, switchTo } = useRoles(token, 'investisseur');

  const [space, setSpace] = useState<InvestorSpace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    api
      .getInvestorSpace(token)
      .then(setSpace)
      .catch((err) => {
        // 403 = le rôle n'est pas pris. Ce n'est pas une panne : c'est une
        // porte, et le message du serveur dit comment l'ouvrir.
        if (err instanceof ApiError && err.status === 403) setRefus(err.message);
        else setError(err instanceof ApiError ? err.message : "Impossible de charger l'espace.");
      })
      .finally(() => setIsLoading(false));
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <div>
          <Brand />
          <p className="muted">{user?.email}</p>
        </div>
        <div className="app-nav">
          <Link href="/marketplace">Mentors &amp; investisseurs</Link>
          <Link href="/constitution">Constitution</Link>
          <Link href="/account">Mon compte</Link>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>

      <RoleBar roles={roles} onSwitch={switchTo} />

      <h1>Mon portefeuille</h1>

      {refus && (
        <div className="card">
          <p style={{ marginTop: 0 }}>{refus}</p>
          <Link className="primary" href="/roles" style={{ display: 'inline-block' }}>
            Prendre le rôle Investisseur
          </Link>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {space && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Portefeuille global</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              <Chiffre libelle="Montant investi" valeur={euros(space.global.investedCents)} />
              <Chiffre libelle="Capital récupéré" valeur={euros(space.global.repaidCents)} />
              <Chiffre libelle="Dividendes reçus" valeur={euros(space.global.dividendsCents)} />
              <Chiffre libelle="Projets" valeur={String(space.global.projectCount)} />
            </div>
            <p className="muted" style={{ marginBottom: 0, marginTop: '1rem' }}>
              Solde net : <strong>{euros(space.global.netCents)}</strong> — ce qui est revenu
              moins ce qui a été mis. Négatif tant que le capital n&apos;est pas rentré, et
              c&apos;est normal au début.
            </p>
          </div>

          <p className="notice" style={{ marginTop: '1.5rem' }}>
            <span>{space.notice}</span>
          </p>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Mes investissements</h2>
            {space.lines.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Aucun investissement enregistré pour l&apos;instant.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {space.lines.map((ligne) => (
                  <li
                    key={ligne.financedProjectId}
                    className="project-item"
                    style={{ cursor: 'default', marginBottom: '0.75rem' }}
                  >
                    <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
                      <strong>{ligne.projectTitle}</strong>
                      <span className="muted">{STATUTS[ligne.status] ?? ligne.status}</span>
                    </div>
                    <dl
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '0.75rem',
                        margin: 0,
                      }}
                    >
                      <Poste libelle="Investi" valeur={euros(ligne.investedCents)} />
                      <Poste libelle="Récupéré" valeur={euros(ligne.repaidCents)} />
                      <Poste libelle="Dividendes" valeur={euros(ligne.dividendsCents)} />
                      <Poste
                        libelle="Participation"
                        valeur={
                          ligne.shareBasisPoints === null
                            ? '—'
                            : pourcentage(ligne.shareBasisPoints)
                        }
                      />
                    </dl>
                    {ligne.shareNotice && (
                      <p className="muted" style={{ margin: '0.5rem 0 0' }}>
                        {ligne.shareNotice}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        {libelle}
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.4rem', fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </p>
    </div>
  );
}

function Poste({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <dt className="muted" style={{ fontSize: '0.75rem' }}>
        {libelle}
      </dt>
      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{valeur}</dd>
    </div>
  );
}
