'use client';

import { useEffect, useState } from 'react';
import type { Analysis, AnalysisSource } from '@/lib/api';

/** 1-10 → 0-100. La source ne produit que des dizaines, et l'écran le dit. */
function surCent(surDix: number): number {
  return surDix * 10;
}

/**
 * CE QU'IGINI EXAMINE, PENDANT QU'IL L'EXAMINE.
 *
 * L'analyse prend quarante à quatre-vingt-dix secondes, pendant lesquelles
 * la personne ne voyait qu'un libellé de bouton changer. Quarante secondes
 * de silence devant un écran, c'est très long — assez pour croire que
 * quelque chose a cassé.
 *
 * ## Pourquoi aucune case ne se coche
 *
 * La tentation serait de faire progresser une liste : « ✓ le problème », puis
 * « ✓ le marché », etc. Ce serait faux. Le modèle répond d'un seul bloc :
 * il n'y a aucun moment où « le marché » est fini et « les risques » pas
 * encore. Des coches qui avancent seules seraient une animation déguisée en
 * information, et c'est précisément le genre de petit mensonge qui, répété,
 * apprend à ne plus croire ce que l'écran affiche.
 *
 * Ce qui est montré est donc vrai : la liste de ce qui sera rendu — elle
 * vient du schéma que le modèle doit remplir — et le temps réellement
 * écoulé. Le compteur est la seule chose qui bouge, et il ne ment pas.
 */
export function AnalyseEnCours() {
  const [secondes, setSecondes] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div className="top-bar" style={{ marginBottom: '0.75rem' }}>
        <strong>IGINI lit ton projet</strong>
        <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {secondes} s
        </span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Ce qu&apos;il va te rendre :
      </p>
      <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
        <li>ce qu&apos;il a compris de ton idée</li>
        <li>les points forts qu&apos;il y voit</li>
        <li>les risques qu&apos;il identifie</li>
        <li>une note de faisabilité, et pourquoi celle-là</li>
        <li>les premières actions concrètes</li>
      </ul>
      <p className="muted" style={{ marginBottom: 0 }}>
        Cela prend en général entre 40 et 90 secondes. Aucune de ces lignes ne se cochera
        avant la fin : le modèle répond d&apos;un seul bloc, et faire avancer une barre
        serait une animation, pas une information.
      </p>
    </div>
  );
}

/**
 * LE RÉSULTAT, PRÉSENTÉ COMME UN VERDICT QU'ON PEUT DISCUTER.
 *
 * L'analyse s'affichait comme une carte parmi d'autres : un score nu, un
 * paragraphe, trois listes. Tout y était, et rien ne se lisait — le travail
 * réel du modèle passait inaperçu.
 *
 * Trois partis pris :
 *
 * — **Le score porte sa raison.** Un chiffre sans justification ne se
 *   conteste pas et ne dit pas quoi corriger. C'est le modèle qui l'écrit,
 *   pas nous ; quand il ne l'a pas fournie — analyses antérieures à ce
 *   champ — l'écran le dit au lieu d'en fabriquer une.
 *
 * — **La note éclaire, elle ne trie pas.** Il y avait un seuil à 75/100 :
 *   en dessous, Ignitux proposait de reprendre l'idée. Retiré le
 *   2026-10-31 — tout projet passe à la construction (l'enchaînement IGINI
 *   la fait dans la foulée), et retravailler son idée reste toujours
 *   possible.
 *
 * — **La granularité est dite.** La note vient d'un entier sur dix : elle
 *   vaut 60 ou 70, jamais 63. Afficher « /100 » sans le préciser laisserait
 *   croire à une précision que la source n'a pas.
 */
export function AnalyseResultat({
  analyse,
  onCorriger,
  onContinuer,
}: {
  analyse: Analysis;
  onCorriger: () => void;
  onContinuer: () => void;
}) {
  const note = surCent(analyse.feasibility_score);

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Ce qu&apos;IGINI a compris</h3>
      <p>{analyse.summary}</p>

      <SourcesConsultees sources={analyse.sources} />

      <h3>Les points forts</h3>
      <Liste items={analyse.strengths} vide="Aucun point fort relevé." />

      <h3>Les risques identifiés</h3>
      <Liste items={analyse.risks} vide="Aucun risque relevé." />

      <div
        className="card"
        style={{ marginTop: '1.5rem', background: 'var(--bg-deep, transparent)' }}
      >
        <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Faisabilité</h3>
          <strong
            style={{
              fontSize: '1.6rem',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--or-texte)',
            }}
          >
            {note} / 100
          </strong>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.8rem' }}>
          La note vient d&apos;un entier sur dix : elle vaut {note - 10}, {note} ou {note + 10},
          jamais un chiffre intermédiaire.
        </p>

        <h4 style={{ marginBottom: '0.35rem' }}>Pourquoi ce score ?</h4>
        {analyse.score_rationale ? (
          <p style={{ marginTop: 0 }}>{analyse.score_rationale}</p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Cette analyse est antérieure à l&apos;explication du score : IGINI ne l&apos;a pas
            écrite, et en fabriquer une après coup serait inventer son raisonnement. Relance
            une analyse pour l&apos;obtenir.
          </p>
        )}
      </div>

      <h3>La suite</h3>
      <p style={{ marginTop: 0 }}>
        La note éclaire, elle ne bloque rien : ton projet passe à la construction, quelle
        qu&apos;elle soit. Les risques ci-dessus sont ceux à traiter en premier — et tu peux
        toujours retravailler ton idée.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="primary" type="button" onClick={onContinuer}>
          Passer à la construction
        </button>
        <button className="secondary" type="button" onClick={onCorriger}>
          Corriger mon idée
        </button>
      </div>

      {analyse.next_steps.length > 0 && (
        <>
          <h3>Les premières actions</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Elles sont déjà dans tes tâches — inutile de les recopier.
          </p>
          <Liste items={analyse.next_steps} vide="" />
        </>
      )}
    </div>
  );
}

/**
 * CE QU'IGINI A VÉRIFIÉ EN LIGNE, PAS SEULEMENT CE QU'IL SAVAIT DÉJÀ.
 *
 * `analyse.sources` n'est jamais rempli par le modèle : Ignitux le
 * reconstruit après coup à partir des pages que la recherche web a
 * réellement renvoyées. Ce que cet écran montre est donc vérifiable — on
 * peut cliquer chaque lien — plutôt qu'une liste d'URLs que le modèle
 * prétendrait avoir consultées.
 *
 * `undefined` (analyses antérieures à cette fonctionnalité) et `[]`
 * (recherche lancée mais rien trouvé à vérifier) racontent deux histoires
 * différentes, et l'écran les distingue au lieu de les confondre en un
 * même silence.
 */
function SourcesConsultees({ sources }: { sources: AnalysisSource[] | undefined }) {
  if (sources === undefined) return null;

  if (sources.length === 0) {
    return (
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Aucune recherche en ligne n&apos;a été nécessaire pour cette analyse : IGINI a jugé ce
        qu&apos;il savait déjà suffisant.
      </p>
    );
  }

  return (
    <>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        IGINI a vérifié ces éléments en ligne avant de conclure — pas seulement dans ce
        qu&apos;il savait déjà :
      </p>
      <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
        {sources.map((source) => (
          <li key={source.url} style={{ marginBottom: '0.35rem', fontSize: '0.9rem' }}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function Liste({ items, vide }: { items: string[]; vide: string }) {
  if (items.length === 0) {
    return vide ? (
      <p className="muted" style={{ marginTop: 0 }}>
        {vide}
      </p>
    ) : null;
  }
  return (
    <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: '0.35rem' }}>
          {item}
        </li>
      ))}
    </ul>
  );
}
