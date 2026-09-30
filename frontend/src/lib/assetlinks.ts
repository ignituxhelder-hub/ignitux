/**
 * Le contenu de `/.well-known/assetlinks.json` — voir la route pour le pourquoi.
 *
 * Ici seulement la règle, pour qu'elle se teste sans serveur : une route
 * Next ne peut exporter que ses méthodes HTTP.
 */

const EMPREINTE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PAQUET = /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/;

export function declarationsAndroid(
  paquet: string | undefined,
  empreintes: string | undefined,
): unknown[] {
  const nom = paquet?.trim();
  if (!nom || !PAQUET.test(nom)) return [];
  // Une empreinte mal copiée ne part pas : Chrome la refuserait sans rien
  // dire, et l'application garderait sa barre d'adresse.
  const valides = (empreintes ?? '')
    .split(',')
    .map((e) => e.trim().toUpperCase())
    .filter((e) => EMPREINTE.test(e));
  if (valides.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: nom, sha256_cert_fingerprints: valides },
    },
  ];
}
