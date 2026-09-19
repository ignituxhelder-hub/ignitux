'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Brand } from '@/components/ignitux-mark';

/**
 * Ce que voit quelqu'un quand une page casse.
 *
 * Sans ce fichier, Next sert un écran nu en anglais. Pour une personne
 * qui teste le produit, un écran nu veut dire « tout est cassé, je ne
 * peux plus rien faire » — alors qu'en général une seule page a échoué
 * et que le reste fonctionne.
 *
 * Trois choses, dans cet ordre :
 *
 * 1. dire que c'est Ignitux qui a échoué, pas la personne. Un doute sur
 *    « qu'est-ce que j'ai fait de travers ? » coûte plus que l'erreur ;
 * 2. proposer de réessayer — `reset()` remonte le composant sans
 *    recharger toute l'application, et beaucoup d'échecs sont passagers ;
 * 3. ne RIEN promettre sur les données. On ne sait pas si l'action a
 *    abouti côté serveur ; écrire « rien n'a été perdu » serait inventer
 *    une garantie qu'on n'a pas.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La console est le seul endroit où le détail technique a sa place :
    // l'afficher à l'écran n'aiderait personne et pourrait exposer des
    // informations internes.
    console.error('Ignitux — erreur non rattrapée :', error);
  }, [error]);

  return (
    <main className="page">
      <Brand />
      <h1>Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="muted">
        Quelque chose a échoué de notre côté, pas du tien. Le reste d&apos;Ignitux continue
        probablement de fonctionner.
      </p>

      <p className="notice">
        <span>
          Si tu venais d&apos;enregistrer quelque chose, <strong>vérifie-le</strong> avant de
          recommencer : on ne peut pas savoir d&apos;ici si l&apos;action est arrivée au bout.
        </span>
      </p>

      <div className="hero-actions">
        <button className="primary" type="button" onClick={reset} style={{ width: 'auto' }}>
          Réessayer
        </button>
        <Link href="/projects" className="muted" style={{ alignSelf: 'center' }}>
          Retour à mes projets
        </Link>
      </div>

      {error.digest && (
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Référence à donner si tu signales le problème : <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
