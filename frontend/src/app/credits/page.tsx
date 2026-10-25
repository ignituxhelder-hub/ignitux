'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { enCredits } from '@/components/prix-igini';
import { api, ApiError, OfflineReadError, type LigneCredits, type VueCredits } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { prixEnEuros } from '@/lib/bareme-public';
import { jourEtHeure } from '@/lib/montants';

/** Combien de mouvements se lisent sans rien déplier. */
const DERNIERS = 10;

/**
 * MES CRÉDITS — le solde, le prix de chaque action, et d'où vient chaque
 * mouvement.
 *
 * Spec : docs/superpowers/specs/2026-10-25-credits-design.md. Remplace la
 * page des offres : il n'y a plus d'abonnement, tous les outils sont
 * gratuits, seules les actions IGINI se paient, en crédits.
 *
 * Écran court (préférence « listes compactes ») : le solde et les recharges
 * d'abord, le barème replié, les dix derniers mouvements — les plus anciens
 * derrière un repli.
 *
 * Les recharges sont grisées tant que le paiement par carte n'existe pas
 * (lot 2) : le serveur le dit (`rechargeDisponible`, `rechargeMessage`), la
 * page le répète au lieu d'un bouton qui échouerait.
 */
export default function CreditsPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const [vue, setVue] = useState<VueCredits | null>(null);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    let annule = false;
    api
      .getCredits(token)
      .then((recu) => {
        if (annule) return;
        setVue(recu);
        setHorsLigneDepuis(null);
      })
      .catch((err) => {
        if (annule) return;
        // Sans réseau : la dernière copie, datée — jamais présentée comme fraîche.
        if (err instanceof OfflineReadError) {
          setVue(err.data as VueCredits);
          setHorsLigneDepuis(err.cachedAt);
          return;
        }
        setErreur(err instanceof ApiError ? err.message : 'Impossible de lire tes crédits.');
      });
    return () => {
      annule = true;
    };
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  const bareme = vue?.bareme;
  const historique = Array.isArray(vue?.historique) ? vue.historique : [];
  const recents = historique.slice(0, DERNIERS);
  const anciens = historique.slice(DERNIERS);

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
      </div>

      <h1>Mes crédits</h1>

      {erreur && <p className="error">{erreur}</p>}
      {!vue && !erreur && <p className="loading">Chargement…</p>}
      {horsLigneDepuis && (
        <p className="notice">
          <span>Hors ligne : ton solde tel qu’il était le {jourEtHeure(horsLigneDepuis)}.</span>
        </p>
      )}

      {vue && bareme && (
        <>
          <section className="card" aria-labelledby="credits-solde-titre">
            <h2 id="credits-solde-titre" style={{ marginTop: 0 }}>
              Ton solde
            </h2>
            <p className="credits-solde">
              <span>{vue.solde}</span>{' '}
              <span style={{ fontSize: '1rem' }}>{vue.solde > 1 ? 'crédits' : 'crédit'}</span>
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              1 crédit = {prixEnEuros(bareme.valeurCreditCentimes, 'fr')} €. Tous les outils sont
              gratuits ; seules les actions d’IGINI se paient, au prix affiché avant de les lancer.
              Rien n’est débité si IGINI échoue.
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {bareme.bienvenue} crédits offerts à l’inscription.
            </p>
          </section>

          <section className="card" aria-labelledby="credits-recharger" style={{ marginTop: '1.5rem' }}>
            <h2 id="credits-recharger" style={{ marginTop: 0 }}>
              Recharger
            </h2>
            <ul
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', listStyle: 'none', margin: 0, padding: 0 }}
            >
              {bareme.recharges.map((r) => (
                <li key={r.prixCentimes}>
                  {/* Grisé : le paiement par carte est le lot 2. Un bouton
                      qui échouerait ferait croire à une panne. */}
                  <button className="secondary" type="button" disabled style={{ width: 'auto' }}>
                    {`${prixEnEuros(r.prixCentimes, 'fr')} € · ${r.credits} crédits`}
                  </button>
                </li>
              ))}
            </ul>
            <p className="notice" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              <span>{bareme.rechargeMessage}</span>
            </p>
          </section>

          <details className="card" style={{ marginTop: '1.5rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Le prix de chaque action ({bareme.actions.length})
            </summary>
            <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
              {bareme.actions.map((a) => (
                <li key={a.generateur} style={{ marginBottom: '0.35rem' }}>
                  {a.libelle} ·{' '}
                  <strong className="credits-montant">{enCredits(a.credits)}</strong>
                  {a.par === 'message' ? ' par message' : ''}
                </li>
              ))}
            </ul>
            <p className="muted" style={{ marginBottom: 0, fontSize: '0.85rem' }}>
              Une action lancée depuis le chat se paie en plus du message, à son propre prix. Dans
              le projet de quelqu’un d’autre, ce sont ses crédits qui paient.
            </p>
          </details>

          <section className="card" aria-labelledby="credits-historique" style={{ marginTop: '1.5rem' }}>
            <h2 id="credits-historique" style={{ marginTop: 0 }}>
              Historique
            </h2>
            {historique.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Aucun mouvement pour l’instant.
              </p>
            ) : (
              <>
                <ListeMouvements lignes={recents} />
                {anciens.length > 0 && (
                  <details style={{ marginTop: '0.75rem' }}>
                    <summary style={{ cursor: 'pointer' }}>Plus anciens ({anciens.length})</summary>
                    <ListeMouvements lignes={anciens} />
                  </details>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/** Ce que la personne lit pour chaque mouvement, selon sa nature. */
function titreDe(l: LigneCredits): string {
  const action = l.libelle ?? l.generateur ?? 'Action IGINI';
  switch (l.kind) {
    case 'bienvenue':
      return 'Cadeau de bienvenue';
    case 'debit':
      return action;
    case 'remboursement':
      return `Rendu : ${action}`;
    case 'ajustement_admin':
      return 'Ajustement par Ignitux';
    case 'recharge':
      return 'Recharge';
    default:
      return action;
  }
}

function ListeMouvements({ lignes }: { lignes: LigneCredits[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
      {lignes.map((l) => {
        const details = [
          jourEtHeure(l.date),
          l.projet?.titre,
          l.acteur ? `par ${l.acteur}` : null,
          // Le motif d'un ajustement ou d'un remboursement dit pourquoi le solde a bougé.
          l.kind === 'ajustement_admin' || l.kind === 'remboursement' ? l.motif : null,
        ].filter(Boolean);
        return (
          <li key={l.id} style={{ padding: '0.4rem 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline' }}>
              <span>{titreDe(l)}</span>
              <strong className="credits-montant">{l.credits > 0 ? `+${l.credits}` : `−${Math.abs(l.credits)}`}</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              {details.join(' · ')}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
