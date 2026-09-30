import type { MetadataRoute } from 'next';

/**
 * CE QUI FAIT D'IGNITUX UNE APPLICATION.
 *
 * Avec le service worker (`public/sw.js`), ce fichier suffit pour qu'un
 * téléphone ou un ordinateur propose « Installer Ignitux » : une icône sur
 * l'écran d'accueil, une fenêtre sans barre d'adresse, un démarrage même
 * sans réseau. Pas de boutique, pas de second code à maintenir — la même
 * application que le web.
 *
 * `start_url` ouvre le lanceur : on installe Ignitux pour retrouver ses
 * applications, pas pour retomber sur la page d'accueil publique.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/accueil',
    name: 'Ignitux',
    short_name: 'Ignitux',
    description:
      "Ton entreprise dans une seule application, avec IGINI pour t'accompagner : projets, " +
      'clients, factures, comptabilité, banque, investissements.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/accueil',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    // Les deux doivent suivre --bg : c'est ce que le système peint pendant
    // l'ouverture, et un écart se voit comme un flash.
    background_color: '#08090d',
    theme_color: '#08090d',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Appui long sur l'icône (Android), clic droit dans la barre des tâches
    // (Windows). L'icône de l'application sert pour chacun : trois pictos de
    // plus à dessiner n'apprendraient rien à personne.
    shortcuts: [
      { name: 'Mes projets', url: '/projects', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Facturation', url: '/facturation', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Relations', url: '/crm', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    // La fenêtre d'installation d'Android et de Windows montre ces images
    // (et le Microsoft Store les exige). Données fictives, dessinées par
    // `scripts/generer-images-app.mjs --captures`.
    screenshots: [
      {
        src: '/screenshots/lanceur-telephone.png',
        sizes: '1170x2532',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Le lanceur : tes applications, et ce qu’IGINI te propose',
      },
      {
        src: '/screenshots/lanceur-ordinateur.png',
        sizes: '1920x1200',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Le lanceur sur ordinateur',
      },
    ],
    // Rouvrir Ignitux (icône, raccourci, lien) ramène la fenêtre déjà
    // ouverte au lieu d'en empiler une seconde — ce que ferait une
    // application ordinaire.
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    // Aucune application de boutique à préférer : c'est la même.
    prefer_related_applications: false,
  };
}
