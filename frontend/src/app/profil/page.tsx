'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { Champ } from '@/components/champs-profil';
import { api, ApiError, type ProfileValues, type ProfileView } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * LE PROFIL, EN ENTIER, POUR QUI VEUT LE VOIR.
 *
 * Cette page existe pour deux raisons, et aucune n'est « il faut bien un
 * écran de profil » :
 *
 * 1. **Voir ce qu'Ignitux sait de soi.** Une personne doit pouvoir lire, en
 *    un endroit, tout ce que le produit a enregistré sur elle — et corriger.
 * 2. **Répondre d'avance si on en a envie.** Le parcours pose les questions
 *    au moment utile ; certains préfèrent tout remplir une fois. Les deux
 *    chemins mènent au même endroit.
 *
 * Ce qu'elle n'est pas : le passage obligé de l'inscription. Rien ici n'est
 * requis pour se servir du produit, et le pourcentage ne reproche rien.
 */
export default function ProfilePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [vue, setVue] = useState<ProfileView | null>(null);
  const [brouillon, setBrouillon] = useState<ProfileValues>({});
  const [isLoading, setIsLoading] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async (jeton: string) => {
    setIsLoading(true);
    try {
      const v = await api.getProfile(jeton);
      setVue(v);
      setBrouillon(v.values);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de lire ton profil.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger(token);
  }, [isReady, token, router, charger]);

  if (!isReady || !token) return null;

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      const v = await api.saveProfile(token, brouillon);
      setVue(v);
      setBrouillon(v.values);
      setMessage('Enregistré.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="page">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour à mes projets
        </Link>
      </div>

      <h1>Ce qu&apos;Ignitux sait de toi</h1>
      <p className="muted">
        Rien ici n&apos;est obligatoire. Chaque question dit à quoi elle sert, et tu peux
        laisser vide ce dont tu ne vois pas l&apos;utilité — le produit fonctionne sans.
      </p>

      {erreur && <p className="error">{erreur}</p>}
      {message && (
        <p className="notice">
          <span>{message}</span>
        </p>
      )}
      {isLoading && <p className="loading">Chargement…</p>}

      {vue && (
        <>
          <div className="card">
            <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>Profil rempli</h2>
              <strong style={{ fontSize: '1.4rem', fontVariantNumeric: 'tabular-nums' }}>
                {vue.completion.percent} %
              </strong>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              {vue.completion.filled} réponse(s) sur {vue.completion.total} qui comptent. Les
              questions facultatives n&apos;entrent pas dans ce calcul : un pourcentage qui
              baisse parce qu&apos;on n&apos;a pas rempli l&apos;accessoire pousse à tout
              remplir, y compris ce dont personne n&apos;a besoin.
            </p>

            {vue.completion.missing.length > 0 && (
              <>
                <h3 style={{ marginBottom: '0.5rem' }}>Ce qui manque, et ce que ça ouvrirait</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {vue.completion.missing.map((m) => (
                    <li key={m.id} style={{ marginBottom: '0.6rem' }}>
                      <strong>{m.label}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                        {m.unlocks ?? 'Rien de précis pour l’instant — c’est du contexte pour IGINI.'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <form className="card" onSubmit={enregistrer} style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Tes réponses</h2>
            {vue.fields.map((champ) => (
              <Champ
                key={champ.id}
                champ={champ}
                valeur={brouillon[champ.id] ?? (champ.kind === 'liste' ? [] : '')}
                onChange={(v) => setBrouillon((p) => ({ ...p, [champ.id]: v }))}
              />
            ))}
            <button className="primary" type="submit" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>

          <p className="muted" style={{ marginTop: '1.5rem' }}>
            Ce que tu écris ici devient un souvenir personnel d&apos;IGINI, rattaché à toi et
            non à un projet : il te suivra d&apos;un projet à l&apos;autre. Tout figure dans
            l&apos;export de tes données, et part avec ton compte si tu le supprimes.
          </p>
        </>
      )}
    </main>
  );
}
