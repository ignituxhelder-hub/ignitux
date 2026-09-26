/**
 * Répertoire de sortie du build, surchargeable par `NEXT_DIST_DIR`.
 *
 * Par défaut `.next`, comme partout. La surcharge existe à cause d'un
 * piège qui a déjà coûté une panne sur ce projet : lancer `next build`
 * pendant qu'un `next dev` ou `next start` sert le même `.next` corrompt
 * le répertoire en cours de lecture, et le site répond 500 — y compris
 * pour quelqu'un qui est en train de l'utiliser.
 *
 *   NEXT_DIST_DIR=.next-verif npm run build
 *
 * vérifie alors que tout compile sans toucher à ce qui est servi. À
 * utiliser dès qu'une instance tourne (session de test, démonstration).
 *
 * Un effet de bord à connaître : Next réécrit `tsconfig.json` à chaque
 * build pour y déclarer `<distDir>/types`, et il le reformate au passage.
 * Après un build de vérification, remettre le fichier en état :
 *
 *   git checkout frontend/tsconfig.json
 *
 * ── Pourquoi .js et non .ts ──────────────────────────────────────────────
 *
 * L'image de production (voir Dockerfile) n'embarque volontairement pas
 * TypeScript : ce n'est ni une source, ni une dépendance de production. Un
 * `next.config.ts` force pourtant Next à charger TypeScript au démarrage —
 * et à défaut, à tenter de l'installer lui-même dans le conteneur, ce qui
 * échoue (l'utilisateur d'exécution n'a pas le droit d'écrire dans
 * node_modules) et fait boucler le conteneur en redémarrage permanent.
 * Un fichier .js n'a besoin de rien de tout ça pour se charger.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
