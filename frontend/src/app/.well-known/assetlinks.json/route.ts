/**
 * LA PREUVE QUE L'APPLICATION ANDROID ET LE SITE SONT À LA MÊME PERSONNE.
 *
 * Sur le Play Store, Ignitux est le site lui-même, ouvert en plein écran par
 * Chrome (une « Trusted Web Activity »). Chrome n'accepte d'enlever la barre
 * d'adresse que si le site déclare, ici, quelle application a le droit de
 * l'afficher : son nom de paquet et l'empreinte de la clé qui la signe.
 * Sans ce fichier, l'application s'ouvre quand même — avec une barre
 * d'adresse en haut, ce qui la fait passer pour un site mal emballé.
 *
 * Les deux valeurs viennent de l'environnement, pas du code : l'empreinte
 * n'existe qu'une fois la clé de signature créée (par la Play Console ou
 * Bubblewrap), et elle diffère entre une version de test et celle du
 * Store. Voir `docs/applications-natives.md`.
 *
 *   ANDROID_PACKAGE_NAME=app.ignitux.twa
 *   ANDROID_SHA256_CERT_FINGERPRINTS=AB:CD:…,12:34:…   (plusieurs possibles)
 *
 * Ce ne sont pas des secrets : ce fichier est public par nature.
 *
 * Tant qu'elles manquent, la réponse est une liste vide — un refus propre,
 * pas une erreur 500 qui ferait croire à une panne.
 */

import { declarationsAndroid } from '@/lib/assetlinks';

// Lue à chaque requête : sinon Next figerait au build les valeurs de
// l'environnement de build, qui n'est pas celui de production.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    declarationsAndroid(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_CERT_FINGERPRINTS),
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
