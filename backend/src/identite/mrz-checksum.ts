/**
 * Checksum ICAO 9303 — l'algorithme est indépendant du format (TD1/TD2/TD3),
 * seule la position des champs change selon le format. Cette fonction
 * valide le chiffre de contrôle global porté en dernière position de la
 * ligne 2 d'un passeport (TD3, 44 caractères) : c'est le contrôle
 * automatique gratuit le plus solide qui existe pour détecter un document
 * trafiqué, sans dépendre d'un service payant.
 *
 * Écrit en interne plutôt qu'avec une dépendance tierce : l'algorithme
 * tient en quelques lignes et se teste avec des vecteurs calculés à la
 * main (voir mrz-checksum.spec.ts) — une dépendance externe ajouterait un
 * risque de compatibilité pour un gain nul.
 */
const POIDS = [7, 3, 1];

function valeurCaractere(char: string): number {
  if (char === '<') return 0;
  if (char >= '0' && char <= '9') return char.charCodeAt(0) - '0'.charCodeAt(0);
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  throw new Error(`Caractère MRZ invalide : ${char}`);
}

function checksum(champ: string): number {
  let somme = 0;
  for (let i = 0; i < champ.length; i++) {
    somme += valeurCaractere(champ[i]) * POIDS[i % 3];
  }
  return somme % 10;
}

/**
 * Valide le chiffre de contrôle composite d'une ligne MRZ TD3 (passeport,
 * 44 caractères). Rend `null` quand aucune ligne de longueur MRZ standard
 * (30 = TD1, 44 = TD3) n'est trouvée — absence de signal, pas un échec.
 *
 * TD1 (carte d'identité, 3 lignes de 30) n'est pas encore couvert : les
 * positions de champs de ce format doivent être vérifiées contre la
 * spécification ICAO 9303 Part 5 avant d'y étendre ce contrôle — laissé
 * pour une itération suivante plutôt que de risquer des positions
 * incorrectes non vérifiables sans pièce réelle sous la main.
 */
export function validerChecksumMrz(lignes: string[]): boolean | null {
  const ligneTd3 = lignes.find((l) => l.length === 44 && /^[A-Z0-9<]+$/.test(l));
  if (!ligneTd3) return null;

  // Ligne 2 du TD3 : positions 0-9 = numéro de document + check digit,
  // 13-19 = date de naissance + check digit, 21-27 = expiration + check
  // digit, 43 = check digit composite sur des plages fixes de la ligne.
  const numeroEtCheck = ligneTd3.slice(0, 10);
  const naissanceEtCheck = ligneTd3.slice(13, 20);
  const expirationEtCheck = ligneTd3.slice(21, 28);
  const composite =
    numeroEtCheck + naissanceEtCheck + expirationEtCheck + ligneTd3.slice(28, 43);

  const checkNumero = checksum(numeroEtCheck.slice(0, 9)) === Number(numeroEtCheck[9]);
  const checkNaissance = checksum(naissanceEtCheck.slice(0, 6)) === Number(naissanceEtCheck[6]);
  const checkExpiration = checksum(expirationEtCheck.slice(0, 6)) === Number(expirationEtCheck[6]);
  const checkComposite = checksum(composite) === Number(ligneTd3[43]);

  return checkNumero && checkNaissance && checkExpiration && checkComposite;
}
