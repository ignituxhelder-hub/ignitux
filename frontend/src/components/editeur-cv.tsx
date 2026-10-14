'use client';

import type { Cv, CvExperience, CvFormation } from '@/lib/api';

/**
 * LE CV, DÉCRIT PLUTÔT QU'IMPORTÉ.
 *
 * Une fiche par expérience, une par formation, et un bouton pour en
 * ajouter. Les dates sont des mois (le sélecteur natif `type="month"`) :
 * personne ne se souvient du jour où il a changé de poste.
 *
 * Composant contrôlé : il ne sait pas enregistrer. Le parcours de projet
 * enregistre en passant à l'étape suivante, la page Profil avec son propre
 * bouton — et les deux gardent la main sur le moment où ça part.
 */

const EXPERIENCE_VIDE: CvExperience = {
  poste: '',
  entreprise: null,
  debut: null,
  fin: null,
  enCours: false,
  description: null,
};

const FORMATION_VIDE: CvFormation = { diplome: '', etablissement: null, annee: null };

/** Une valeur de champ vide devient null : c'est ce que le serveur attend. */
const ouNull = (v: string) => (v.trim() === '' ? null : v);

/**
 * Le CV tel qu'il part au serveur : les fiches laissées vides sont retirées
 * plutôt que refusées. Ajouter une fiche puis changer d'avis ne doit pas
 * bloquer l'enregistrement de tout le reste.
 */
export function cvAEnvoyer(cv: Cv): Cv {
  return {
    experiences: cv.experiences
      .filter((e) => e.poste.trim() !== '')
      .map((e) => ({ ...e, fin: e.enCours ? null : e.fin })),
    formations: cv.formations.filter((f) => f.diplome.trim() !== ''),
  };
}

export function cvEstVide(cv: Cv): boolean {
  const propre = cvAEnvoyer(cv);
  return propre.experiences.length === 0 && propre.formations.length === 0;
}

export function EditeurCv({ cv, onChange }: { cv: Cv; onChange: (cv: Cv) => void }) {
  const majExperience = (i: number, patch: Partial<CvExperience>) =>
    onChange({
      ...cv,
      experiences: cv.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    });
  const majFormation = (i: number, patch: Partial<CvFormation>) =>
    onChange({
      ...cv,
      formations: cv.formations.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    });

  return (
    <div>
      <h3 style={{ marginBottom: '0.25rem' }}>Ton expérience</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Du plus récent au plus ancien. Le poste suffit ; le reste aide IGINI à partir de là où tu
        en es.
      </p>

      {cv.experiences.map((e, i) => (
        <fieldset key={i} className="card" style={{ marginBottom: '1rem' }}>
          <legend>Expérience {i + 1}</legend>
          <div className="field">
            <label htmlFor={`cv-poste-${i}`}>Poste</label>
            <input
              id={`cv-poste-${i}`}
              value={e.poste}
              maxLength={150}
              placeholder="Ex. : Chef de rayon"
              onChange={(ev) => majExperience(i, { poste: ev.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`cv-entreprise-${i}`}>Entreprise (facultatif)</label>
            <input
              id={`cv-entreprise-${i}`}
              value={e.entreprise ?? ''}
              maxLength={150}
              onChange={(ev) => majExperience(i, { entreprise: ouNull(ev.target.value) })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
            <div className="field">
              <label htmlFor={`cv-debut-${i}`}>De</label>
              <input
                id={`cv-debut-${i}`}
                type="month"
                value={e.debut ?? ''}
                onChange={(ev) => majExperience(i, { debut: ouNull(ev.target.value) })}
              />
            </div>
            {!e.enCours && (
              <div className="field">
                <label htmlFor={`cv-fin-${i}`}>À</label>
                <input
                  id={`cv-fin-${i}`}
                  type="month"
                  value={e.fin ?? ''}
                  onChange={(ev) => majExperience(i, { fin: ouNull(ev.target.value) })}
                />
              </div>
            )}
            <label
              htmlFor={`cv-en-cours-${i}`}
              style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}
            >
              <input
                id={`cv-en-cours-${i}`}
                type="checkbox"
                checked={e.enCours}
                onChange={(ev) => majExperience(i, { enCours: ev.target.checked })}
              />
              J&apos;y suis encore
            </label>
          </div>
          <div className="field">
            <label htmlFor={`cv-description-${i}`}>Ce que tu faisais</label>
            <textarea
              id={`cv-description-${i}`}
              rows={2}
              maxLength={1000}
              placeholder="Ex. : gestion d’une équipe de six, commandes, inventaires"
              value={e.description ?? ''}
              onChange={(ev) => majExperience(i, { description: ouNull(ev.target.value) })}
            />
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onChange({ ...cv, experiences: cv.experiences.filter((_, j) => j !== i) })
            }
          >
            Retirer cette expérience
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => onChange({ ...cv, experiences: [...cv.experiences, { ...EXPERIENCE_VIDE }] })}
        style={{ marginBottom: '1.5rem' }}
      >
        + Ajouter une expérience
      </button>

      <h3 style={{ marginBottom: '0.25rem' }}>Tes formations et diplômes (facultatif)</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Ils servent à une seule chose : savoir si ton activité demande un diplôme que tu as déjà.
        Ce n&apos;est jamais un critère pour te juger.
      </p>

      {cv.formations.map((f, i) => (
        <fieldset key={i} className="card" style={{ marginBottom: '1rem' }}>
          <legend>Formation {i + 1}</legend>
          <div className="field">
            <label htmlFor={`cv-diplome-${i}`}>Diplôme ou formation</label>
            <input
              id={`cv-diplome-${i}`}
              value={f.diplome}
              maxLength={150}
              placeholder="Ex. : CAP Coiffure"
              onChange={(ev) => majFormation(i, { diplome: ev.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor={`cv-etablissement-${i}`}>École (facultatif)</label>
              <input
                id={`cv-etablissement-${i}`}
                value={f.etablissement ?? ''}
                maxLength={150}
                onChange={(ev) => majFormation(i, { etablissement: ouNull(ev.target.value) })}
              />
            </div>
            <div className="field" style={{ width: '7rem' }}>
              <label htmlFor={`cv-annee-${i}`}>Année</label>
              <input
                id={`cv-annee-${i}`}
                type="number"
                inputMode="numeric"
                min={1940}
                max={2100}
                value={f.annee ?? ''}
                onChange={(ev) =>
                  majFormation(i, { annee: ev.target.value ? Number(ev.target.value) : null })
                }
              />
            </div>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => onChange({ ...cv, formations: cv.formations.filter((_, j) => j !== i) })}
          >
            Retirer cette formation
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => onChange({ ...cv, formations: [...cv.formations, { ...FORMATION_VIDE }] })}
      >
        + Ajouter une formation
      </button>
    </div>
  );
}
