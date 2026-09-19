import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
