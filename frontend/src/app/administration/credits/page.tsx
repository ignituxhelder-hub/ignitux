'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { enCredits } from '@/components/prix-igini';
import { api, ApiError, type CompteCredits, type PageComptesCredits } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Les bornes d'un ajustement — les mêmes que le serveur (backend/src/credits/credits.service.ts). */
const AJUSTEMENT_MAX = 10_000;
const MOTIF_MIN = 3;
const MOTIF_MAX = 200;
const PAR_PAGE = 50;

/**
 * ADMINISTRATION — LES CRÉDITS DES COMPTES.
 *
 * Spec : docs/superpowers/specs/2026-10-25-credits-design.md, lot 1. Tant
 * que le paiement par carte n'existe pas, c'est ici qu'un administrateur
 * ajoute (test, geste commercial) ou retire des crédits, toujours avec un
 * motif, que la personne retrouve dans son historique.
 *
 * Le serveur vérifie le rôle à chaque appel ; cette page ne fait que lister
 * et envoyer. Un retrait se confirme avant de partir, et un retrait qui
 * rendrait le solde négatif est refusé par le serveur (409), dont la phrase
 * s'affiche telle quelle.
 */
export default function CreditsAdministrationPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const [vue, setVue] = useState<PageComptesCredits | null>(null);
  const [page, setPage] = useState(1);
  const [saisieRecherche, setSaisieRecherche] = useState('');
  const [recherche, setRecherche] = useState('');
  const [interdit, setInterdit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    try {
      setVue(await api.getComptesCredits(token, { page, parPage: PAR_PAGE, recherche }));
      setErreur(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setInterdit(true);
      else setErreur(err instanceof ApiError ? err.message : 'Impossible de lire les comptes.');
    }
  }, [token, page, recherche]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  if (!isReady || !token) return null;

  const pages = vue ? Math.max(1, Math.ceil(vue.total / vue.parPage)) : 1;

  function chercher(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setRecherche(saisieRecherche.trim());
  }

  function ajuste(compte: CompteCredits, solde: number) {
    // Un ajustement verse aussi la bienvenue qui manquait (sous le même verrou côté serveur).
    setVue((avant) =>
      avant
        ? {
            ...avant,
            comptes: avant.comptes.map((c) => (c.id === compte.id ? { ...c, solde, bienvenueVersee: true } : c)),
          }
        : avant,
    );
    setOuvert(null);
    setConfirmation(`Fait : ${compte.email} a maintenant ${enCredits(solde)}.`);
  }

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/administration">Administration</Link>
      </div>
      <h1>Crédits des comptes</h1>

      {interdit ? (
        <p className="error">Réservé aux administrateurs d’Ignitux.</p>
      ) : (
        <>
          <form onSubmit={chercher} role="search" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: '12rem', marginBottom: 0 }}>
              <label htmlFor="recherche-compte">Rechercher une adresse</label>
              <input
                id="recherche-compte"
                type="search"
                value={saisieRecherche}
                onChange={(e) => setSaisieRecherche(e.target.value)}
              />
            </div>
            <button className="secondary" type="submit" style={{ width: 'auto' }}>
              Rechercher
            </button>
          </form>

          {erreur && <p className="error">{erreur}</p>}
          {confirmation && (
            <p className="notice" style={{ marginTop: '1rem' }}>
              <span>{confirmation}</span>
            </p>
          )}
          {!vue && !erreur && <p className="loading">Chargement…</p>}

          {vue && (
            <>
              <p className="muted" style={{ marginTop: '1rem' }}>
                {`${vue.total} compte${vue.total > 1 ? 's' : ''} · page ${vue.page} sur ${pages}`}
              </p>
              {vue.comptes.length === 0 ? (
                <p className="muted">Aucun compte ne correspond.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {vue.comptes.map((c) => (
                    <li key={c.id} className="card" style={{ marginTop: '0.75rem' }}>
                      <div className="top-bar" style={{ marginBottom: 0 }}>
                        <span style={{ overflowWrap: 'anywhere' }}>{c.email}</span>
                        <strong className="credits-montant">{enCredits(c.solde)}</strong>
                      </div>
                      <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                        {c.bienvenueVersee
                          ? 'Bienvenue versée'
                          : 'Bienvenue pas encore versée (compte d’avant les crédits, versée à sa prochaine visite)'}
                      </p>
                      {ouvert === c.id ? (
                        <FormulaireAjustement
                          token={token}
                          compte={c}
                          onAjuste={(solde) => ajuste(c, solde)}
                          onAnnuler={() => setOuvert(null)}
                        />
                      ) : (
                        <button
                          className="secondary"
                          type="button"
                          style={{ width: 'auto', marginTop: '0.5rem' }}
                          onClick={() => {
                            setConfirmation(null);
                            setOuvert(c.id);
                          }}
                        >
                          Ajuster
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {pages > 1 && (
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    className="secondary"
                    type="button"
                    style={{ width: 'auto' }}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Précédent
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    style={{ width: 'auto' }}
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function FormulaireAjustement({
  token,
  compte,
  onAjuste,
  onAnnuler,
}: {
  token: string;
  compte: CompteCredits;
  onAjuste: (solde: number) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState('');
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const nombre = Number(saisie.trim());
  const valide = saisie.trim() !== '' && Number.isInteger(nombre) && nombre !== 0 && Math.abs(nombre) <= AJUSTEMENT_MAX;
  const libelle = !valide ? 'Valider' : nombre > 0 ? `Ajouter ${enCredits(nombre)}` : `Retirer ${enCredits(-nombre)}`;

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!valide) {
      setErreur(`Indique un nombre entier de crédits, non nul, entre -${AJUSTEMENT_MAX} et ${AJUSTEMENT_MAX}.`);
      return;
    }
    const raison = motif.trim();
    if (raison.length < MOTIF_MIN || raison.length > MOTIF_MAX) {
      setErreur(`Le motif est obligatoire (${MOTIF_MIN} à ${MOTIF_MAX} caractères).`);
      return;
    }
    // Retirer se confirme : c'est le solde de quelqu'un d'autre.
    if (nombre < 0 && !window.confirm(`Retirer ${enCredits(-nombre)} à ${compte.email} ? Motif : ${raison}`)) {
      return;
    }
    setEnCours(true);
    try {
      const { solde } = await api.ajusterCredits(token, compte.id, nombre, raison);
      onAjuste(solde);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'L’ajustement n’a pas pu être enregistré.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} style={{ marginTop: '0.75rem' }}>
      <div className="field">
        <label htmlFor={`ajustement-credits-${compte.id}`}>Crédits (négatif pour retirer)</label>
        <input
          id={`ajustement-credits-${compte.id}`}
          type="number"
          inputMode="numeric"
          step={1}
          min={-AJUSTEMENT_MAX}
          max={AJUSTEMENT_MAX}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`ajustement-motif-${compte.id}`}>Motif (obligatoire)</label>
        <input
          id={`ajustement-motif-${compte.id}`}
          maxLength={MOTIF_MAX}
          placeholder="test, geste commercial…"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
      </div>
      {erreur && <p className="error">{erreur}</p>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="primary" type="submit" style={{ width: 'auto' }} disabled={enCours}>
          {enCours ? 'Enregistrement…' : libelle}
        </button>
        <button className="secondary" type="button" style={{ width: 'auto' }} onClick={onAnnuler} disabled={enCours}>
          Annuler
        </button>
      </div>
    </form>
  );
}
