'use client';

import { useId, useState } from 'react';
import type { JourneyEtatEtape, JourneyPhase, JourneyRepere, JourneyView } from '@/lib/api';

const PHASES: Array<{ id: JourneyPhase; label: string }> = [
  { id: 'decouvrir', label: 'Découvrir' },
  { id: 'construire', label: 'Construire' },
  { id: 'transmettre', label: 'Transmettre' },
];

/**
 * OÙ EN EST LE PROJET.
 *
 * Trois jalons, pas un pourcentage. Un pourcentage d'avancement supposerait
 * qu'on connaisse la longueur du chemin — on ne la connaît pas, et
 * l'inventer serait le score sans source que l'article 10 interdit.
 *
 * La phase franchie se lit, celle en cours se voit, celles à venir se
 * devinent. C'est tout ce dont quelqu'un a besoin pour savoir s'il avance.
 */
export function Progression({ phase }: { phase: JourneyPhase }) {
  const index = PHASES.findIndex((p) => p.id === phase);

  return (
    <ol
      aria-label="Progression du projet"
      style={{
        display: 'flex',
        gap: '0.5rem',
        listStyle: 'none',
        margin: '0 0 1.5rem',
        padding: 0,
        flexWrap: 'wrap',
      }}
    >
      {PHASES.map((p, i) => {
        const franchie = i < index;
        const courante = i === index;
        return (
          <li
            key={p.id}
            aria-current={courante ? 'step' : undefined}
            style={{
              flex: '1 1 8rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              borderColor: courante ? 'var(--accent, var(--border))' : 'var(--border)',
              background: courante ? 'var(--bg-elevated, transparent)' : 'transparent',
              opacity: franchie || courante ? 1 : 0.45,
            }}
          >
            <span
              className="muted"
              style={{ fontSize: 'var(--texte-etiquette)', display: 'block', letterSpacing: '0.04em' }}
            >
              {franchie ? 'Fait' : courante ? 'En cours' : 'À venir'}
            </span>
            <strong style={{ fontSize: '0.95rem' }}>{p.label}</strong>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * OÙ EN EST LE PROJET, EN CHIFFRES.
 *
 * Trois ou quatre repères, en haut, avant tout le reste : la question
 * « où en est ce projet ? » se posait jusqu'ici en faisant défiler la page
 * jusqu'au score, tout en bas.
 *
 * Un repère sans source affiche un tiret, pas un zéro, et dit pourquoi.
 * C'est la même règle que pour les scores : un projet sans analyse n'a pas
 * une étincelle nulle, il n'en a pas.
 */
export function TableauDeBord({
  reperes,
  surTacheVide,
}: {
  reperes: JourneyRepere[] | undefined;
  /**
   * Quoi faire quand la tuile « Tâches » est vide.
   *
   * Sans cela, la tuile annonçait « Aucune tâche encore. » et s'arrêtait là.
   * Le bouton pour en ajouter une existait, mais derrière « Vue avancée » —
   * un libellé qui ne l'annonce pas. Un écran qui constate un vide sans
   * offrir de le combler renvoie la personne chercher elle-même, et c'est
   * exactement ce qu'un guide ne doit pas faire.
   *
   * Optionnel : la tuile s'affiche sans, simplement sans l'action. Une
   * personne qui consulte le projet de quelqu'un d'autre n'a rien à ajouter.
   */
  surTacheVide?: () => void;
}) {
  // Un serveur qui précède ce champ renvoie un parcours sans repères : la
  // fiche doit s'afficher quand même, sans tableau de bord.
  if (!reperes || reperes.length === 0) return null;

  return (
    <section
      aria-label="Où en est le projet"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))',
        gap: '0.75rem',
        margin: '0 0 1.5rem',
      }}
    >
      {reperes.map((repere) => (
        <dl
          key={repere.cle}
          style={{
            margin: 0,
            padding: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <dt
            className="muted"
            style={{ fontSize: 'var(--texte-etiquette)', letterSpacing: '0.04em', margin: 0 }}
          >
            {repere.label}
          </dt>
          <dd style={{ margin: '0.15rem 0 0' }}>
            <strong
              style={{
                fontSize: '1.35rem',
                fontVariantNumeric: 'tabular-nums',
                color: repere.valeur === null ? 'var(--text-muted)' : undefined,
              }}
            >
              {repere.valeur ?? '—'}
            </strong>
            <span
              className="muted"
              style={{ display: 'block', fontSize: 'var(--texte-etiquette)', marginTop: '0.15rem' }}
            >
              {repere.precision}
            </span>
            {repere.cle === 'taches' && repere.valeur === null && surTacheVide && (
              <button
                type="button"
                onClick={surTacheVide}
                style={{
                  /*
                   * Une action, donc une zone qu'un doigt atteint : 2,5 rem,
                   * la même que les liens d'action ailleurs dans le produit.
                   * Écrit d'abord sans, et `traversee-ecrans --telephone` l'a
                   * relevé aussitôt — 99×19 points, sous le seuil. La tuile
                   * grandit d'une vingtaine de points, et seulement dans l'état
                   * vide, qui est justement celui où il n'y a rien d'autre à
                   * regarder.
                   */
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '2.5rem',
                  marginTop: '0.25rem',
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: 'var(--flame)',
                  font: 'inherit',
                  fontSize: 'var(--texte-etiquette)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Ajouter une tâche
              </button>
            )}
          </dd>
        </dl>
      ))}
    </section>
  );
}

/**
 * Les étapes que seuls les générateurs peuvent accomplir.
 *
 * Quand ils sont éteints, envoyer quelqu'un vers elles serait le renvoyer
 * contre une porte close — et un guide qui désigne une porte close cesse
 * d'être un guide. On dit alors ce qui bloque, et par où passer à la place.
 */
const ETAPES_QUI_EXIGENT_L_IA = new Set(['analyser', 'construire', 'developper', 'transmettre']);

/**
 * LA PROCHAINE ÉTAPE.
 *
 * La règle qui tient tout le refactor : Ignitux ne demande jamais « que
 * veux-tu faire ? ». Il le sait, il le dit, et il dit pourquoi.
 *
 * Le « pourquoi » n'est pas un ornement. Une consigne sans raison se subit ;
 * une consigne expliquée se discute — et quelqu'un qui comprend pourquoi
 * l'étape vient maintenant peut décider en connaissance de cause de faire
 * autre chose. C'est la différence entre un accompagnateur et un rail.
 */
export function ProchaineEtape({
  parcours,
  iaDisponible = true,
  onAller,
}: {
  parcours: JourneyView;
  /** false = générateurs éteints. La conduite doit alors proposer autre chose. */
  iaDisponible?: boolean;
  onAller?: (section: string) => void;
}) {
  const etape = parcours.nextStep;

  // Aucune étape déduite : on le dit plutôt que d'en inventer une pour
  // remplir l'encart. Un conseil sans fondement vaut moins que le silence.
  if (!etape) {
    return (
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Tu as fait le tour</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Les étapes du parcours sont franchies. Ignitux n&apos;a pas de suite à te proposer —
          et n&apos;en inventera pas. La direction t&apos;appartient maintenant : ouvre la vue
          avancée si tu cherches un outil précis.
        </p>
      </div>
    );
  }

  // « L'IA accélère, elle ne conditionne pas » : quand elle est éteinte, le
  // parcours ne s'arrête pas, il change de chemin.
  const bloqueeParLIa = !iaDisponible && ETAPES_QUI_EXIGENT_L_IA.has(etape.id);

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <p
        className="muted"
        style={{ margin: 0, fontSize: 'var(--texte-etiquette)', letterSpacing: '0.06em' }}
      >
        PROCHAINE ÉTAPE
      </p>
      <h2 style={{ margin: '0.35rem 0 0.5rem' }}>{etape.titre}</h2>
      <p style={{ marginTop: 0, marginBottom: bloqueeParLIa || onAller ? '1rem' : 0 }}>
        {etape.pourquoi}
      </p>

      {bloqueeParLIa && (
        <p className="notice" style={{ marginBottom: onAller ? '1rem' : 0 }}>
          <span>
            IGINI ne peut pas s&apos;en charger maintenant : ses générateurs sont éteints. Cela
            ne bloque pas ton projet — l&apos;IA accélère, elle ne décide pas. Tu peux avancer à
            la main : note dans la Mémoire ce que tu sais déjà, ou pose tes premières tâches.
            Le parcours suivra.
          </span>
        </p>
      )}
      {onAller && (
        <button className="primary" type="button" onClick={() => onAller(etape.section)}>
          Y aller
        </button>
      )}
    </div>
  );
}

const ETAT_DIT: Record<JourneyEtatEtape, string> = {
  fait: 'faite',
  'en-cours': 'en cours',
  'a-venir': 'à venir',
};

const ETAT_SIGNE: Record<JourneyEtatEtape, string> = {
  fait: '✅',
  'en-cours': '▶',
  'a-venir': '○',
};

/**
 * TON PARCOURS — le guide pas à pas de l'écran projet.
 *
 * Remplace la seule « prochaine étape » pour le porteur : une personne qui
 * découvre Ignitux a besoin de voir le chemin entier pour savoir où elle en
 * est, et d'un bouton qui l'emmène à l'endroit exact où agir. Le chemin et
 * les états viennent du serveur ; ce composant ne décide de rien.
 *
 * Sur téléphone, le CSS replie les étapes faites et celles au-delà des deux
 * prochaines (`guide-etape--repliee`) ; « Voir tout » les rouvre.
 */
export function GuideParcours({
  parcours,
  iaDisponible = true,
  onAller,
}: {
  parcours: JourneyView;
  iaDisponible?: boolean;
  onAller: (etapeId: string) => void;
}) {
  const titreId = useId();
  const [tout, setTout] = useState(false);
  const etape = parcours.nextStep;
  const indexEnCours = parcours.guide.findIndex((e) => e.etat === 'en-cours');
  // Rien d'en cours (tout est fait) : on ne replie rien, les ✅ sont la
  // réponse à « où en suis-je ? ».
  const repliee = (index: number, etat: JourneyEtatEtape) =>
    indexEnCours >= 0 && (etat === 'fait' || index > indexEnCours + 2);
  const aReplier = parcours.guide.some((e, index) => repliee(index, e.etat));
  const faitesRepliees = parcours.guide.filter((e, index) => e.etat === 'fait' && repliee(index, e.etat)).length;
  const bloqueeParLIa = !!etape && !iaDisponible && ETAPES_QUI_EXIGENT_L_IA.has(etape.id);

  return (
    <section
      className={`card guide-parcours${tout ? ' guide-parcours--tout' : ''}`}
      data-visite="guide"
      aria-labelledby={titreId}
      style={{ marginBottom: '1.5rem' }}
    >
      <h2 id={titreId} style={{ marginTop: 0 }}>
        {etape ? 'Ton parcours' : 'Tu as fait le tour'}
      </h2>

      {faitesRepliees > 0 && !tout && (
        <p className="guide-parcours__resume">
          ✅ {faitesRepliees} {faitesRepliees > 1 ? 'étapes faites' : 'étape faite'}
        </p>
      )}

      <ol className="guide-parcours__liste">
        {parcours.guide.map((e, index) => (
          <li
            key={e.id}
            className={`guide-etape guide-etape--${e.etat}${repliee(index, e.etat) ? ' guide-etape--repliee' : ''}`}
            aria-current={e.etat === 'en-cours' ? 'step' : undefined}
            aria-label={`${e.label}, ${ETAT_DIT[e.etat]}`}
          >
            <span className="guide-etape__signe" aria-hidden="true">
              {ETAT_SIGNE[e.etat]}
            </span>
            <span className="guide-etape__texte">
              <span className="guide-etape__label">
                {index + 1}. {e.label}
              </span>
              {e.etat === 'en-cours' && etape && (
                <span className="guide-etape__detail">
                  <h3 className="guide-etape__titre">{etape.titre}</h3>
                  <span className="guide-etape__pourquoi">{etape.pourquoi}</span>
                  {bloqueeParLIa && (
                    <span className="notice">
                      <span>
                        IGINI ne peut pas s&apos;en charger maintenant : ses générateurs sont
                        éteints. Cela ne bloque pas ton projet — l&apos;IA accélère, elle ne décide
                        pas. Tu peux avancer à la main : note dans la Mémoire ce que tu sais déjà,
                        ou pose tes premières tâches. Le parcours suivra.
                      </span>
                    </span>
                  )}
                  <button className="primary guide-etape__aller" type="button" onClick={() => onAller(e.id)}>
                    Y aller
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {!etape && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Les étapes du parcours sont franchies. Ignitux n&apos;a pas de suite à te proposer — et
          n&apos;en inventera pas. La direction t&apos;appartient maintenant : ouvre la vue avancée
          si tu cherches un outil précis.
        </p>
      )}

      {aReplier && (
        <button
          type="button"
          className="secondary guide-parcours__tout"
          aria-expanded={tout}
          onClick={() => setTout((v) => !v)}
        >
          {tout ? 'Replier' : 'Voir tout'}
        </button>
      )}
    </section>
  );
}

/**
 * CE QUI N'EST PAS ENCORE OUVERT.
 *
 * Montré uniquement en vue avancée. Cacher une fonction sans jamais dire
 * qu'elle existe ferait croire au produit qu'il ne l'a pas — et donnerait
 * à quelqu'un une raison de partir chercher ailleurs ce qu'Ignitux sait
 * déjà faire.
 *
 * Chaque ligne dit ce qui l'ouvrira, concrètement. Jamais « bientôt » :
 * « bientôt » est une promesse que personne ne tient et que rien ne mesure.
 */
export function SectionsFermees({ parcours }: { parcours: JourneyView }) {
  if (parcours.locked.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Pas encore ouvert</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Ces outils existent et fonctionnent. Ils apparaîtront d&apos;eux-mêmes quand ils
        auront quelque chose à montrer — un outil vide n&apos;aide personne.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {parcours.locked.map((s) => (
          <li key={s.section} style={{ marginBottom: '0.6rem' }}>
            <strong>{s.label}</strong>
            <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
              {s.condition}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
