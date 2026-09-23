'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type AiUsageHistory, type AiUsageMonth } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jourEtHeure } from '@/lib/montants';

const GENERATEURS: Record<string, string> = {
  analyser: 'Analyser',
  construire: 'Construire',
  financer: 'Financer',
  developper: 'Développer',
  transmettre: 'Transmettre',
};

/** Euros décimaux → texte. Distinct de `euros()`, qui part de centimes entiers. */
function eurosDepuisNombre(valeur: number | null): string {
  if (valeur === null) return '—';
  return `${valeur.toFixed(2).replace('.', ',')} €`;
}

function milliers(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * CE QUE L'IA A CONSOMMÉ, ET CE QU'IL RESTE.
 *
 * La télémétrie enregistrait modèle, jetons, horodatage, utilisateur, projet
 * et type de génération ; les plafonds refusaient en 402. Rien de tout cela
 * n'était visible. Un plafond qu'on ne voit pas approcher est un refus qui
 * tombe sans prévenir, au moment précis où la personne avait préparé son
 * travail.
 *
 * Deux honnêtetés tenues ici :
 *
 * — Le coût est **dérivé**, pas facturé. Il est calculé depuis une grille
 *   tarifaire dont la date est affichée : un montant sans la date de son
 *   tarif est invérifiable.
 * — Un modèle hors grille donne `null`, jamais zéro. Zéro dirait « gratuit » ;
 *   null dit « on ignore combien », ce qui n'est pas la même information.
 */
export default function AiUsagePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [mois, setMois] = useState<AiUsageMonth | null>(null);
  const [historique, setHistorique] = useState<AiUsageHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    Promise.all([api.getAiUsageMonth(token), api.getAiUsageHistory(token)])
      .then(([m, h]) => {
        setMois(m);
        setHistorique(h);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de lire ta consommation.'),
      )
      .finally(() => setIsLoading(false));
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  const quota = mois?.quota;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Consommation IA</h1>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {quota?.plafond_atteint && (
        <p className="error">{quota.message ?? 'Plafond mensuel atteint.'}</p>
      )}
      {quota && !quota.plafond_atteint && quota.bientot_atteint && (
        <p className="notice">
          <span>
            Tu approches du plafond mensuel. Mieux vaut le savoir maintenant qu&apos;au moment
            de lancer une analyse.
          </span>
        </p>
      )}

      {mois && (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Ce mois-ci</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              <Chiffre libelle="Analyses utilisées" valeur={milliers(mois.appels)} />
              <Chiffre
                libelle="Analyses restantes"
                valeur={
                  mois.quota.restant.analyses === null
                    ? 'sans plafond'
                    : milliers(mois.quota.restant.analyses)
                }
              />
              <Chiffre libelle="Coût total" valeur={eurosDepuisNombre(mois.cout.euros)} />
              <Chiffre
                libelle="Budget restant"
                valeur={
                  mois.quota.restant.euros === null
                    ? '—'
                    : eurosDepuisNombre(mois.quota.restant.euros)
                }
              />
            </div>

            {mois.quota.plafonds.analyses_par_mois !== null && (
              <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
                {/* Un compteur sans son plafond ne se lit pas : « il me reste 2 »
                    ne veut rien dire tant qu'on ne sait pas 2 sur combien, ni
                    qui fixe ce combien. */}
                Sur les {milliers(mois.quota.plafonds.analyses_par_mois)} incluses ce mois-ci
                {mois.quota.plafonds.analyses_selon
                  ? ` par ton ${mois.quota.plafonds.analyses_selon}`
                  : ''}
                . Le compteur repart au premier jour du mois prochain.
              </p>
            )}

            <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Coût <strong>estimé</strong> depuis la grille tarifaire du {mois.cout.grille_du} —
              ce n&apos;est pas un montant facturé, c&apos;est un calcul à partir des jetons
              réellement consommés. Plafonds du mois :{' '}
              {mois.quota.plafonds.analyses_par_mois === null
                ? 'aucun plafond en nombre'
                : `${milliers(mois.quota.plafonds.analyses_par_mois)} analyses`}
              {' · '}
              {mois.quota.plafonds.euros_par_mois === null
                ? 'aucun plafond en euros'
                : eurosDepuisNombre(mois.quota.plafonds.euros_par_mois)}
              .
            </p>

            {mois.quota.restant.euros === null &&
              mois.quota.plafonds.euros_par_mois !== null && (
                <p className="notice" style={{ marginTop: '0.75rem' }}>
                  <span>
                    Le budget restant n&apos;est pas calculable : un modèle utilisé ce mois-ci
                    échappe à la grille tarifaire. Ce n&apos;est pas « il reste de la marge »,
                    c&apos;est « on ne sait pas ».
                  </span>
                </p>
              )}

            {mois.cout.modeles_non_tarifes.length > 0 && (
              <p className="notice" style={{ marginTop: '0.75rem' }}>
                <span>
                  Modèle(s) hors grille : {mois.cout.modeles_non_tarifes.join(', ')}. Leurs
                  appels sont comptés, leur coût ne l&apos;est pas.
                </span>
              </p>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Par générateur</h2>
            {mois.par_generateur.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Aucun appel ce mois-ci.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {mois.par_generateur.map((ligne) => (
                  <li
                    key={ligne.generateur}
                    className="project-item"
                    style={{ cursor: 'default', marginBottom: '0.5rem' }}
                  >
                    <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                      <strong>{GENERATEURS[ligne.generateur] ?? ligne.generateur}</strong>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {eurosDepuisNombre(ligne.cout_euros)}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: 0 }}>
                      {ligne.appels} appel(s) · {milliers(ligne.tokens_entree)} jetons en entrée ·{' '}
                      {milliers(ligne.tokens_sortie)} en sortie
                      {ligne.dont_reflexion > 0 &&
                        `, dont ${milliers(ligne.dont_reflexion)} de réflexion`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
              La réflexion interne du modèle est <strong>comprise</strong> dans les jetons de
              sortie, pas en plus : ne l&apos;additionne pas.
            </p>
          </div>
        </>
      )}

      {historique && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Historique</h2>
          {historique.appels.length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Aucun appel enregistré. Les générateurs sont éteints tant qu&apos;une clé
              n&apos;est pas configurée — rien n&apos;est cassé, rien n&apos;a été dépensé.
            </p>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {historique.appels.map((appel) => (
                  <li
                    key={appel.id}
                    className="top-bar"
                    style={{ marginBottom: '0.4rem', cursor: 'default', alignItems: 'baseline' }}
                  >
                    <span>
                      <span className="muted">{jourEtHeure(appel.quand)}</span>{' '}
                      {GENERATEURS[appel.generateur] ?? appel.generateur}
                      <span className="muted">
                        {' '}
                        · {appel.modele} · {milliers(appel.tokens_entree)}↓{' '}
                        {milliers(appel.tokens_sortie)}↑ · {appel.duree_ms} ms
                      </span>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {eurosDepuisNombre(appel.cout_euros)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
                Les {historique.limite} appels les plus récents. Un tiret dans la colonne de
                droite signifie que le modèle échappe à la grille du {historique.grille_du} —
                pas que l&apos;appel était gratuit.
              </p>
            </>
          )}
        </div>
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
