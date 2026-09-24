import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from 'next/font/google';
import type { ReactNode } from 'react';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceWorker } from '@/components/service-worker';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

// Sora porte la personnalité de la marque (titres, chiffres des scores) ;
// IBM Plex Sans reste lisible pour le texte courant ; IBM Plex Mono marque
// les données précises (labels, tableau de bord de l'Étincelle) — la même
// paire que les documents internes (feuille de route, rapports).
const sora = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Ignitux',
  description:
    "Igini, l'intelligence d'Ignitux, t'accompagne pour transformer une idée en réalité — analyser, construire, financer, développer, transmettre.",
};

export const viewport: Viewport = {
  // Doit suivre --bg : c'est la couleur que le navigateur mobile peint
  // autour de la page, et un écart se voit immédiatement.
  themeColor: '#08090d',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        {/* N'affiche rien : il pose le service worker qui rend l'ouverture
            possible sans réseau, et sait aussi le retirer. Article 16. */}
        <ServiceWorker />
        <AuthProvider>
          {/* Monté au niveau racine : l'état hors ligne concerne toute
              l'application, pas une page en particulier, et le bandeau ne
              s'affiche que s'il a réellement quelque chose à dire. Le
              conteneur l'aligne sur la largeur des pages — sans lui, le
              bandeau partait en pleine largeur, collé aux bords. */}
          <div className="offline-slot">
            <OfflineBanner />
          </div>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
