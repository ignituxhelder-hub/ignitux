'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker — et sait s'en défaire.
 *
 * ── Pourquoi seulement en production ─────────────────────────────────────
 *
 * En développement, un service worker sert des ressources mises en cache
 * pendant qu'on modifie le code : on passe alors du temps à déboguer une
 * version qui n'existe plus. `next dev` recompile à chaque frappe, et le
 * worker n'a rien à y apporter.
 *
 * ── Pourquoi il sait se désinstaller ─────────────────────────────────────
 *
 * Un service worker est la seule chose qu'on installe chez quelqu'un et
 * qu'on ne peut plus retirer depuis le serveur : une fois posé, il survit
 * aux déploiements, et si l'on décide demain de l'abandonner, il resterait
 * à servir d'anciennes ressources indéfiniment.
 *
 * D'où la branche du bas. Le jour où l'on ne veut plus de lui, il suffit de
 * retirer `sw.js`, et ce code nettoie ce qui traîne chez les gens qui
 * l'avaient déjà. Sans elle, on dépendrait de chacun pour vider son
 * navigateur, ce qui revient à ne jamais pouvoir revenir en arrière.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const enProduction = process.env.NODE_ENV === 'production';

    if (!enProduction) {
      // En développement, on retire activement ce qu'une session de
      // production aurait pu laisser sur le même port.
      void navigator.serviceWorker.getRegistrations().then((liste) => {
        for (const enregistrement of liste) void enregistrement.unregister();
      });
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Un échec d'enregistrement n'est pas une panne du produit : il perd
      // le démarrage hors ligne, rien d'autre. On ne dérange personne avec
      // ça — le bandeau hors ligne dira la vérité le moment venu.
    });
  }, []);

  return null;
}
