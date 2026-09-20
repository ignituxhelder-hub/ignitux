'use client';

import { useEffect, useState } from 'react';
import type { Analysis } from '@/lib/api';

/** Le seuil du parcours, répété ici pour que l'écran puisse l'expliquer. */
const SEUIL = 75;

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
 * — **La recommandation n'est pas un verrou.** Sous le seuil, Ignitux
 *   propose de reprendre. Les deux portes restent ouvertes, et « continuer
 *   malgré tout » est écrit sans reproche : c'est le projet de la personne.
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
  const auDessus = note >= SEUIL;

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Ce qu&apos;IGINI a compris</h3>
      <p>{analyse.summary}</p>

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
              color: auDessus ? 'var(--ok)' : 'var(--warn)',
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

      <h3>Recommandation</h3>
      <p style={{ marginTop: 0 }}>
        {auDessus
          ? `Avec ${note}/100, l'idée est jugée assez solide pour passer à la construction. Les risques ci-dessus restent à traiter, mais ils ne justifient pas d'attendre.`
          : `Avec ${note}/100, l'idée est en dessous du seuil de ${SEUIL}. Les risques relevés valent la peine d'être traités maintenant : les reprendre plus tard coûtera davantage.`}
      </p>

      <h3>Ta décision</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Ignitux recommande, il ne décide pas. Passer outre est un choix légitime — c&apos;est
        ton projet.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className={auDessus ? 'secondary' : 'primary'}
          type="button"
          onClick={onCorriger}
        >
          Corriger mon idée
        </button>
        <button
          className={auDessus ? 'primary' : 'secondary'}
          type="button"
          onClick={onContinuer}
        >
          {auDessus ? 'Passer à la construction' : 'Continuer malgré tout'}
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
