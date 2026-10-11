/**
 * LA SIGNATURE DE MANDATS EST SUSPENDUE.
 *
 * Un mandat autorise Ignitux à agir au nom de la personne (déposer un dossier
 * de création d'entreprise, par exemple). Tant qu'un avocat n'a pas rendu son
 * avis écrit sur ce mandat — sa rédaction, la signature électronique simple,
 * la responsabilité d'Ignitux comme mandataire —, on n'en recueille aucun :
 * il vaut mieux ne rien proposer que faire signer un engagement fragile.
 *
 * Quand c'est `true` :
 *   — créer et signer un mandat répondent 409 avec MESSAGE_MANDATS_SUSPENDUS ;
 *   — lire ses mandats et les révoquer continuent de marcher (un mandat déjà
 *     signé doit toujours pouvoir être retiré) ;
 *   — GET /identite/mandats/texte renvoie `signatureSuspendue: true`, et
 *     l'interface affiche une note neutre à la place du formulaire ;
 *   — la vérification d'identité, elle, n'est PAS suspendue.
 *
 * Pour lever la suspension, une fois l'avis reçu et le texte du mandat
 * (mandate-text.ts) ajusté s'il le demande : passer cette constante à
 * `false`, mettre à jour mandats-suspension.spec.ts, déployer. Rien d'autre.
 */
export const MANDATS_SUSPENDUS = true;

export const MESSAGE_MANDATS_SUSPENDUS =
  'La signature de mandats est suspendue en attendant un avis juridique. Rien n’est déposé à ta place.';
