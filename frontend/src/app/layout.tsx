import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from 'next/font/google';
import type { ReactNode } from 'react';
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
  themeColor: '#0b0c10',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
