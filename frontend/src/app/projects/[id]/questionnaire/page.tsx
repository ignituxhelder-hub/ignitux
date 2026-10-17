'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Champ } from '@/components/champs-profil';
import { cvAEnvoyer, cvEstVide, EditeurCv } from '@/components/editeur-cv';
import { IginiMention } from '@/components/igini-mention';
import {
  api,
  ApiError,
  type Cv,
  type ProfileField,
  type ProfileValues,
  type QuestionProjet,
  type Questionnaire,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * LE QUESTIONNAIRE DU PROJET, ÉTAPE PAR ÉTAPE.
 *
 * Ce qu'IGINI devinait jusqu'ici à partir de trois phrases, demandé une
 * fois, au moment où la personne décrit son idée. Trois règles :
 *
 * 1. **Une étape à la fois**, avec « Étape X sur Y ». Vingt questions d'un
 *    coup font fuir ; quatre par écran se remplissent.
 * 2. **Rien n'est obligatoire.** Chaque étape s'enregistre en passant à la
 *    suivante, « Terminer plus tard » est toujours là, et rien n'est perdu.
 * 3. **On ne demande pas deux fois.** Le CV et la situation sont sautés
 *    quand le profil les connaît déjà : ils suivent la personne d'un projet
 *    à l'autre.
 *
 * L'étape 1 (le nom et l'idée) a eu lieu sur l'écran de création : le
 * compteur commence donc à 2.
 */

/** Ce qui décrit la personne et sert l'analyse, demandé ici s'il manque. */
const CHAMPS_SITUATION = ['current_situation', 'has_founded_before', 'skills', 'availability'];

type Etape =
  | { kind: 'cv' }
  | { kind: 'situation'; champs: ProfileField[] }
  | { kind: 'projet'; id: string; titre: string; intro: string }
  | { kind: 'igini' };

type Reponses = Record<string, string | string[]>;

function estRempli(v: string | string[] | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  return Array.isArray(v) ? v.length > 0 : v.trim() !== '';
}

function estVisible(q: QuestionProjet, reponses: Reponses): boolean {
  if (!q.visibleSi) return true;
  const v = reponses[q.visibleSi.question];
  return typeof v === 'string' && q.visibleSi.parmi.includes(v);
}

export default function QuestionnairePage() {
  const { id } = useParams<{ id: string }>();
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [etapes, setEtapes] = useState<Etape[]>([]);
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Reponses>({});
  const [cv, setCv] = useState<Cv>({ experiences: [], formations: [] });
  const [profil, setProfil] = useState<ProfileValues>({});
  const [reponsesIgini, setReponsesIgini] = useState<Record<string, string>>({});
  const [iginiIndisponible, setIginiIndisponible] = useState(false);
  const [preparation, setPreparation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    let annule = false;
    (async () => {
      try {
        const [q, vue, monCv] = await Promise.all([
          api.getQuestionnaire(token, id),
          api.getProfile(token),
          api.getCv(token),
        ]);
        if (annule) return;

        // Les étapes sont fixées au chargement : une étape qui disparaîtrait
        // dès qu'on y répond ferait sauter le compteur sous les yeux.
        const situation = vue.fields.filter(
          (f) => CHAMPS_SITUATION.includes(f.id) && !estRempli(vue.values[f.id]),
        );
        const liste: Etape[] = [];
        if (cvEstVide(monCv)) liste.push({ kind: 'cv' });
        if (situation.length > 0) liste.push({ kind: 'situation', champs: situation });
        for (const e of q.etapes) liste.push({ kind: 'projet', ...e });
        liste.push({ kind: 'igini' });

        setQuestionnaire(q);
        setReponses(q.reponses);
        setCv(monCv);
        setProfil(vue.values);
        setReponsesIgini(
          Object.fromEntries(q.questionsIgini.map((x) => [x.id, x.reponse ?? ''])),
        );
        setEtapes(liste);
      } catch (err) {
        if (!annule) {
          setErreur(err instanceof ApiError ? err.message : 'Impossible de charger le questionnaire.');
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, [isReady, token, id, router]);

  const etape = etapes[index];

  // Arrivée sur la dernière étape : IGINI prépare ses questions, une fois.
  useEffect(() => {
    if (!token || etape?.kind !== 'igini' || !questionnaire) return;
    if (questionnaire.questionsIginiPreparees || iginiIndisponible || preparation) return;
    setPreparation(true);
    api
      .prepareIginiQuestions(token, id)
      .then((q) => {
        setQuestionnaire(q);
        setReponsesIgini(Object.fromEntries(q.questionsIgini.map((x) => [x.id, x.reponse ?? ''])));
      })
      // Pas bloquant : sans ses questions, on termine simplement sans elles.
      .catch(() => setIginiIndisponible(true))
      .finally(() => setPreparation(false));
  }, [token, id, etape, questionnaire, iginiIndisponible, preparation]);

  if (!isReady || !token) return null;

  /** Enregistre l'étape affichée. Rend false si l'enregistrement a échoué. */
  async function enregistrerEtape(termine = false): Promise<boolean> {
    if (!token || !etape || !questionnaire) return true;
    setEnCours(true);
    setErreur(null);
    try {
      if (etape.kind === 'cv') {
        if (!cvEstVide(cv)) setCv(await api.saveCv(token, cvAEnvoyer(cv)));
      } else if (etape.kind === 'situation') {
        const valeurs: ProfileValues = {};
        for (const c of etape.champs) if (c.id in profil) valeurs[c.id] = profil[c.id];
        if (Object.keys(valeurs).length > 0) await api.saveProfile(token, valeurs);
      } else if (etape.kind === 'projet') {
        // Une réponse à une question devenue invisible est retirée : elle
        // décrirait un projet qui n'est plus celui-là.
        const envoi: Record<string, string | string[] | null> = {};
        for (const q of questionnaire.questions.filter((x) => x.etape === etape.id)) {
          envoi[q.id] = estVisible(q, reponses) && estRempli(reponses[q.id]) ? reponses[q.id] : null;
        }
        const q = await api.saveQuestionnaire(token, id, envoi, termine);
        setQuestionnaire({ ...q, questionsIgini: questionnaire.questionsIgini });
      } else if (etape.kind === 'igini') {
        if (questionnaire.questionsIgini.length > 0) {
          await api.answerIginiQuestions(
            token,
            id,
            questionnaire.questionsIgini.map((x) => ({
              id: x.id,
              reponse: reponsesIgini[x.id]?.trim() || null,
            })),
          );
        } else if (termine) {
          await api.saveQuestionnaire(token, id, {}, true);
        }
      }
      return true;
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "L'enregistrement a échoué.");
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function aller(vers: number) {
    if (await enregistrerEtape()) {
      setIndex(vers);
      window.scrollTo?.({ top: 0 });
    }
  }

  async function terminer() {
    if (await enregistrerEtape(true)) router.push(`/projects/${id}`);
  }

  async function plusTard() {
    if (await enregistrerEtape()) router.push(`/projects/${id}`);
  }

  const total = etapes.length + 1;
  const derniere = index === etapes.length - 1;

  return (
    <main className="page">
      <p style={{ marginBottom: '0.5rem' }}>
        <Link href={`/projects/${id}`}>← Retour au projet</Link>
      </p>
      <h1 style={{ marginBottom: '0.25rem' }}>Pour une analyse juste</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Quelques questions pour qu&apos;IGINI parte de ta situation réelle au lieu de la deviner.
        Rien n&apos;est obligatoire : « Je ne sais pas encore » est une vraie réponse.
      </p>

      {erreur && <p className="error">{erreur}</p>}
      {!questionnaire && !erreur && <p className="loading">Chargement…</p>}

      {etape && questionnaire && (
        <>
          <div
            role="progressbar"
            aria-label="Avancement du questionnaire"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={index + 2}
            style={{ margin: '1rem 0' }}
          >
            <strong>
              Étape {index + 2} sur {total}
            </strong>
            <div
              style={{
                height: '0.4rem',
                background: 'var(--border, #ddd)',
                borderRadius: '999px',
                marginTop: '0.4rem',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${((index + 2) / total) * 100}%`,
                  height: '100%',
                  // Une mesure (où on en est), pas une action : de l'or, pas du feu.
                  background: 'linear-gradient(90deg, var(--or-sombre), var(--or))',
                }}
              />
            </div>
          </div>

          <section className="card">
            {etape.kind === 'cv' && (
              <>
                <h2 style={{ marginTop: 0 }}>Ton parcours</h2>
                <p className="muted">
                  Pas de fichier à importer : décris tes postes en quelques mots, avec les dates.
                  Tu ne le feras qu&apos;une fois, il servira à tous tes projets.
                </p>
                <EditeurCv cv={cv} onChange={setCv} />
              </>
            )}

            {etape.kind === 'situation' && (
              <>
                <h2 style={{ marginTop: 0 }}>Ta situation</h2>
                {etape.champs.map((champ) => (
                  <Champ
                    key={champ.id}
                    champ={champ}
                    boutons
                    valeur={profil[champ.id] ?? (champ.kind === 'liste' ? [] : '')}
                    onChange={(v) => setProfil((p) => ({ ...p, [champ.id]: v }))}
                  />
                ))}
              </>
            )}

            {etape.kind === 'projet' && (
              <>
                <h2 style={{ marginTop: 0 }}>{etape.titre}</h2>
                <p className="muted">{etape.intro}</p>
                {questionnaire.questions
                  .filter((q) => q.etape === etape.id && estVisible(q, reponses))
                  .map((q) => (
                    <Champ
                      key={q.id}
                      prefixe="questionnaire"
                      champ={q}
                      boutons
                      valeur={reponses[q.id] ?? (q.kind === 'liste' ? [] : '')}
                      onChange={(v) => setReponses((r) => ({ ...r, [q.id]: v }))}
                    />
                  ))}
              </>
            )}

            {etape.kind === 'igini' && (
              <>
                <h2 style={{ marginTop: 0 }}>Les questions d&apos;IGINI</h2>
                {preparation && (
                  <IginiMention>lit tes réponses et prépare ses questions…</IginiMention>
                )}
                {!preparation && iginiIndisponible && (
                  <p className="muted">
                    IGINI n&apos;a pas pu préparer ses questions pour l&apos;instant. Ce n&apos;est
                    pas bloquant : tu peux terminer, tes réponses sont enregistrées.
                  </p>
                )}
                {!preparation &&
                  !iginiIndisponible &&
                  questionnaire.questionsIginiPreparees &&
                  questionnaire.questionsIgini.length === 0 && (
                    <p className="muted">
                      IGINI a tout ce qu&apos;il lui faut : aucune question de plus.
                    </p>
                  )}
                {questionnaire.questionsIgini.map((q) => (
                  <div className="field" key={q.id} style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor={`igini-${q.id}`}>{q.question}</label>
                    <textarea
                      id={`igini-${q.id}`}
                      rows={2}
                      maxLength={1000}
                      value={reponsesIgini[q.id] ?? ''}
                      onChange={(e) =>
                        setReponsesIgini((r) => ({ ...r, [q.id]: e.target.value }))
                      }
                    />
                    {q.pourquoi && (
                      <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
                        {q.pourquoi}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </section>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {index > 0 && (
              <button
                type="button"
                className="secondary"
                disabled={enCours}
                onClick={() => void aller(index - 1)}
              >
                Précédent
              </button>
            )}
            {derniere ? (
              <button
                type="button"
                className="primary"
                disabled={enCours || preparation}
                onClick={() => void terminer()}
              >
                {enCours ? 'Enregistrement…' : 'Terminer'}
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={enCours}
                onClick={() => void aller(index + 1)}
              >
                {enCours ? 'Enregistrement…' : 'Suivant'}
              </button>
            )}
            {!derniere && (
              <button
                type="button"
                className="secondary"
                disabled={enCours}
                onClick={() => void plusTard()}
              >
                Terminer plus tard
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
