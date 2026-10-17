import type { Metadata, Viewport } from 'next';
import { Cinzel, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Braises } from '@/components/braises';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceWorker } from '@/components/service-worker';
import { Systeme } from '@/components/systeme';
import { AuthProvider } from '@/lib/auth';
import { EspaceProvider } from '@/lib/espace';
import { imagesDemarrage } from '@/lib/ecrans-demarrage';
import './globals.css';

// Cinzel, ce sont les capitales gravées de la boussole : titres, marque et
// chiffres des scores (direction « Gravure », 17/10/2026). Le latin étendu
// couvre le portugais. IBM Plex Sans reste lisible pour le texte courant ;
// IBM Plex Mono marque les données précises (labels, tableau de bord de
// l'Étincelle) — la même paire que les documents internes.
const cinzel = Cinzel({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});
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
  // Installée sur iPhone, l'application ignore le manifeste : Safari lit
  // ces balises-ci pour le titre, `apple-icon.png` pour l'icône, et les
  // écrans de démarrage pour ne pas s'ouvrir sur du blanc.
  appleWebApp: {
    capable: true,
    title: 'Ignitux',
    statusBarStyle: 'black',
    startupImage: imagesDemarrage(),
  },
  // `appleWebApp.capable` n'écrit que la balise propre à Apple ; Chrome sur
  // Android lit celle-ci quand on ajoute la page à l'écran d'accueil sans
  // passer par l'installation.
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  // Doit suivre --bg : c'est la couleur que le navigateur mobile peint
  // autour de la page, et un écart se voit immédiatement.
  themeColor: '#08090d',
  // Installée sur iPhone, la page occupe tout l'écran, encoche comprise ;
  // `globals.css` rend la place avec les marges `safe-area-inset-*`.
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}className={`${cinzel.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        {/* Les étincelles qui montent derrière tout le site : un décor,
            sous le contenu, qui ne capte aucun toucher. */}
        <Braises />
        {/* N'affiche rien : il pose le service worker qui rend l'ouverture
            possible sans réseau, et sait aussi le retirer. Article 16. */}
        <ServiceWorker />
        <NextIntlClientProvider>
        <AuthProvider>
          {/* L'espace où l'on travaille (Équipe) : posé avant que les pages
              chargent leurs données. */}
          <EspaceProvider>
          {/* Monté au niveau racine : l'état hors ligne concerne toute
              l'application, pas une page en particulier, et le bandeau ne
              s'affiche que s'il a réellement quelque chose à dire. Le
              conteneur l'aligne sur la largeur des pages — sans lui, le
              bandeau partait en pleine largeur, collé aux bords. */}
          <div className="offline-slot">
            <OfflineBanner />
          </div>
          {/* Le bureau, la barre de l'application et la barre des tâches :
              ce qui fait d'Ignitux un système plutôt qu'une suite de pages. */}
          <Systeme>{children}</Systeme>
          </EspaceProvider>
        </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
