import ecrans from './ecrans-demarrage.json';

/**
 * LES ÉCRANS DE DÉMARRAGE DE L'IPHONE ET DE L'IPAD.
 *
 * Installée sur l'écran d'accueil, une application web s'ouvre sur iOS par
 * un écran blanc — Safari ignore la couleur de fond du manifeste. Sur un
 * produit au fond presque noir, c'est un flash qui fait « site web », à
 * chaque ouverture.
 *
 * La seule parade est de fournir une image par taille d'écran exacte : iOS
 * ne redimensionne rien, et une image à la mauvaise taille est ignorée.
 * D'où une liste d'appareils, et non une image unique.
 *
 * La liste vit dans `ecrans-demarrage.json` parce que deux programmes la
 * lisent : cette page (qui annonce les images) et
 * `scripts/generer-images-app.mjs` (qui les dessine). Un test vérifie que
 * chaque image annoncée existe.
 *
 * Portrait seulement : en paysage, iOS retombe sur le fond, sans rien
 * casser. Un nouvel iPhone absent de la liste aura le même sort — il faut
 * l'y ajouter, puis relancer le script.
 */

export interface EcranDemarrage {
  appareil: string;
  largeur: number;
  hauteur: number;
  ratio: number;
}

export const ECRANS_DEMARRAGE: EcranDemarrage[] = ecrans;

export function fichierDemarrage(ecran: EcranDemarrage): string {
  return `/splash/apple-splash-${ecran.largeur * ecran.ratio}x${ecran.hauteur * ecran.ratio}.png`;
}

export function mediaDemarrage(ecran: EcranDemarrage): string {
  return (
    `(device-width: ${ecran.largeur}px) and (device-height: ${ecran.hauteur}px) and ` +
    `(-webkit-device-pixel-ratio: ${ecran.ratio}) and (orientation: portrait)`
  );
}

/** Au format de `metadata.appleWebApp.startupImage`. */
export function imagesDemarrage() {
  return ECRANS_DEMARRAGE.map((ecran) => ({ url: fichierDemarrage(ecran), media: mediaDemarrage(ecran) }));
}
