'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { api, ApiError, type CatalogueOffres, type Offre } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euros } from '@/lib/montants';

const GENERATEURS: Record<string, string> = {
  analyser: 'Analyser',
  construire: 'Construire',
  financer: 'Financer',
  developper: 'Développer',
  transmettre: 'Transmettre',
};

/**
 * LES OFFRES — et ce qu'on refuse de leur faire dire.
 *
 * ## Pas de bouton qui ne mène nulle part
 *
 * Tant qu'aucun fournisseur de paiement n'encaisse, la page n'affiche aucun
 * bouton « Choisir ». Trois boutons qui échoueraient tous seraient la pire
 * version de cet écran : la personne conclurait que le produit est cassé,
 * pas qu'il n'est pas encore en vente.
 *
 * ## Ce que la gratuite comporte, et pas seulement ce qui lui manque
 *
 * Une grille d'offres se lit d'habitude comme une liste de privations. Ici
 * la colonne gratuite dit d'abord ce qu'elle donne — un projet entier, les
 * tâches, la mémoire, la conformité, les scores — parce que c'est vrai et
 * que c'est le produit. Ce qui coûte à chaque clic est ailleurs, et c'est
 * la seule frontière.
 */
export default function OffresPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [catalogue, setCatalogue] = useState<CatalogueOffres | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      setCatalogue(await api.getOffres(token));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les offres.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  if (!isReady || !token) return null;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Offres</h1>
      <p className="muted">
        Ce qui ne coûte rien à faire tourner est gratuit. Ce qui coûte à chaque clic — les
        générateurs d&apos;IGINI — est payant, parce que chaque génération se paie en vrai.
      </p>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {catalogue && !catalogue.souscriptionPossible && (
        <p className="notice">
          <span>
            Aucun moyen de paiement n&apos;est en place pour l&apos;instant : ces offres
            décrivent ce qui est prévu, rien ne peut encore être souscrit. Ton compte reste sur{' '}
            {catalogue.offres.find((o) => o.actuelle)?.label ?? 'Découverte'}.
          </span>
        </p>
      )}

      {catalogue && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(17rem, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem',
          }}
        >
          {catalogue.offres.map((offre) => (
            <CarteOffre
              key={offre.id}
              offre={offre}
              souscriptionPossible={catalogue.souscriptionPossible}
            />
          ))}
        </div>
      )}

      {catalogue && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ gap: '1rem', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{catalogue.evaluationFinancement.label}</h2>
            <strong style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {euros(catalogue.evaluationFinancement.prixCentimes)}
            </strong>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {catalogue.evaluationFinancement.resume}
          </p>
          {/* Jamais le montant sans cette phrase. C'est la seule chose qui
              distingue une évaluation payante d'une promesse vendue. */}
          <p style={{ marginBottom: 0, marginTop: '0.75rem' }}>
            <strong>{catalogue.evaluationFinancement.avertissement}</strong>
          </p>
        </div>
      )}
    </main>
  );
}

function CarteOffre({
  offre,
  souscriptionPossible,
}: {
  offre: Offre;
  souscriptionPossible: boolean;
}) {
  const { capacites } = offre;

  return (
    <div
      className="card"
      style={{
        marginTop: 0,
        borderColor: offre.actuelle ? 'var(--accent, var(--border))' : undefined,
      }}
    >
      <div className="top-bar" style={{ gap: '1rem', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{offre.label}</h2>
        <strong style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {offre.prixCentimes === 0 ? 'Gratuit' : `${euros(offre.prixCentimes)} / mois`}
        </strong>
      </div>

      {offre.actuelle && (
        <p className="muted" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
          Ton offre actuelle.
        </p>
      )}

      <p style={{ marginTop: '0.75rem' }}>{offre.resume}</p>

      <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
        <Ligne
          texte={
            capacites.projets === null
              ? 'Projets sans limite'
              : `${capacites.projets} projet${capacites.projets > 1 ? 's' : ''}`
          }
        />
        <Ligne
          texte={
            capacites.appelsIaParMois === null
              ? 'Générations sans limite'
              : `${capacites.appelsIaParMois} générations par mois`
          }
        />
        <Ligne
          texte={
            capacites.generateurs.length === 0
              ? 'Aucun générateur'
              : capacites.generateurs.map((g) => GENERATEURS[g] ?? g).join(', ')
          }
        />
        {capacites.outilsDeGestion && <Ligne texte="Comptabilité, facturation, banque" />}
        {capacites.investisseurs && <Ligne texte="Financement et investisseurs" />}
        {capacites.collaborateurs === null && <Ligne texte="Collaborateurs sans limite" />}
      </ul>

      {offre.argument && (
        <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {offre.argument}
        </p>
      )}

      {/* Aucun bouton tant que rien n'encaisse : un bouton qui échoue fait
          croire à une panne, pas à une offre pas encore ouverte. */}
      {souscriptionPossible && !offre.actuelle && (
        <button className="primary" type="button" style={{ marginTop: '1rem' }}>
          Choisir {offre.label}
        </button>
      )}
    </div>
  );
}

function Ligne({ texte }: { texte: string }) {
  return (
    <li className="muted" style={{ marginBottom: '0.25rem' }}>
      {texte}
    </li>
  );
}
