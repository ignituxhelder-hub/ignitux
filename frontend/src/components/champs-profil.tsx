'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError, type ProfileField, type ProfileValues } from '@/lib/api';

/**
 * UN CHAMP DE PROFIL, AVEC SA RAISON D'ÊTRE.
 *
 * La raison n'est pas une option d'affichage : elle est rendue à chaque
 * fois, sous le champ. Un formulaire qui demande sans dire pourquoi
 * transforme une inscription en interrogatoire — et la personne remplit
 * mal, ou part.
 *
 * Quand le champ ouvre quelque chose, c'est dit aussi. « Ton pays
 * d'activité » ne motive personne ; « la section Conformité affiche
 * aujourd'hui des démarches françaises à tout le monde sans le demander »
 * donne une raison de répondre.
 */
function Champ({
  champ,
  valeur,
  onChange,
}: {
  champ: ProfileField;
  valeur: string | string[] | null;
  onChange: (v: string | string[]) => void;
}) {
  const id = `profil-${champ.id}`;

  return (
    <div className="field" style={{ marginBottom: '1.5rem' }}>
      <label htmlFor={id}>{champ.question}</label>

      {champ.kind === 'texte-long' && (
        <textarea
          id={id}
          rows={4}
          value={typeof valeur === 'string' ? valeur : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {champ.kind === 'texte' && (
        <input
          id={id}
          value={typeof valeur === 'string' ? valeur : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {champ.kind === 'choix' && (
        <select
          id={id}
          value={typeof valeur === 'string' ? valeur : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— sans réponse —</option>
          {(champ.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {champ.kind === 'liste' && (
        <div
          id={id}
          role="group"
          aria-label={champ.question}
          style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}
        >
          {(champ.options ?? []).map((o) => {
            const choisi = Array.isArray(valeur) && valeur.includes(o);
            return (
              <button
                key={o}
                type="button"
                className={choisi ? 'primary' : 'secondary'}
                aria-pressed={choisi}
                onClick={() => {
                  const actuel = Array.isArray(valeur) ? valeur : [];
                  onChange(choisi ? actuel.filter((x) => x !== o) : [...actuel, o]);
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}

      <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', textTransform: 'none', letterSpacing: 0 }}>
        {champ.purpose}
        {champ.unlocks && (
          <>
            {' '}
            <strong>Ce que ça ouvre :</strong> {champ.unlocks}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * CE QU'IL EST UTILE DE DEMANDER ICI.
 *
 * Le serveur dit quelles questions ont un sens à ce moment du parcours ;
 * l'écran ne pose que celles-là. C'est l'inverse du formulaire d'inscription
 * qui demande tout avant d'avoir rien montré.
 *
 * Répondre reste facultatif, et « Plus tard » ne rouvre pas la question à
 * chaque chargement — la refermer sans l'enregistrer serait harceler
 * quelqu'un qui a déjà dit non une fois.
 */
export function ChampsADemander({
  token,
  champs,
  titre,
  onEnregistre,
}: {
  token: string;
  champs: ProfileField[];
  titre: string;
  onEnregistre: () => void;
}) {
  const [valeurs, setValeurs] = useState<ProfileValues>({});
  const [masque, setMasque] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (champs.length === 0 || masque) return null;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await api.saveProfile(token, valeurs);
      setMasque(true);
      onEnregistre();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="card" onSubmit={soumettre} style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>{titre}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {champs.length === 1 ? 'Une question' : `${champs.length} questions`} — tu peux répondre
        plus tard, rien ne bloque.
      </p>
      {erreur && <p className="error">{erreur}</p>}

      {champs.map((champ) => (
        <Champ
          key={champ.id}
          champ={champ}
          valeur={valeurs[champ.id] ?? (champ.kind === 'liste' ? [] : '')}
          onChange={(v) => setValeurs((p) => ({ ...p, [champ.id]: v }))}
        />
      ))}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="primary" type="submit" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="secondary" type="button" onClick={() => setMasque(true)}>
          Plus tard
        </button>
      </div>
    </form>
  );
}

export { Champ };
