/**
 * L'IDENTITÉ LÉGALE D'IGNITUX — lue, jamais écrite dans le code.
 *
 * ## Pourquoi ces valeurs ne sont pas des constantes
 *
 * Une raison sociale, une adresse, un IBAN changent : un déménagement, un
 * changement de banque, un passage en société. Figés dans les sources, ils
 * obligeraient à redéployer pour corriger une facture, et ils partiraient
 * dans le dépôt Git — où un IBAN reste lisible dans l'historique même après
 * l'avoir retiré du fichier.
 *
 * Tout vient donc de l'environnement. Le dépôt ne contient que des
 * emplacements vides et ce commentaire.
 *
 * ## Ce que ce module refuse de faire
 *
 * **Il n'invente rien.** Une valeur absente rend `null`, jamais une chaîne
 * plausible. Une facture émise avec une adresse inventée est une facture
 * fausse, et le produit préfère refuser d'en émettre.
 *
 * **Il ne rend pas l'IBAN complet par défaut.** `pourAffichage()` masque
 * tout sauf les quatre derniers caractères. Le numéro entier ne sort que
 * par `ibanComplet()`, appelé là où un virement en a réellement besoin —
 * et jamais journalisé.
 *
 * ## Les secrets de paiement ne passent pas par ici
 *
 * Une clé Stripe, un jeton de fournisseur : ce module ne les lit pas et ne
 * les expose pas. Ils restent dans l'environnement, lus au plus près de
 * l'appel qui s'en sert, pour qu'aucune structure en mémoire ne les
 * transporte à travers l'application. Ce qui est ici est ce qui peut
 * s'afficher sur une facture ou une page de mentions légales.
 */

/** Ce qui identifie Ignitux vis-à-vis de l'extérieur. */
export interface IdentiteLegale {
  /** Raison sociale ou nom de l'entrepreneur individuel. */
  raisonSociale: string | null;
  /** Adresse postale complète, sur une ligne. */
  adresse: string | null;
  /** Adresse de contact publiée. */
  email: string | null;
  /** SIREN/SIRET, quand l'immatriculation existe. */
  identifiant: string | null;
  /** Numéro de TVA intracommunautaire, quand il y en a un. */
  tva: string | null;
  /** Le BIC de la banque. Public par nature, contrairement à l'IBAN. */
  bic: string | null;
}

/** L'IBAN tel qu'on peut l'afficher : seuls les quatre derniers caractères. */
export function masquerIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const propre = iban.replace(/\s/g, '');
  if (propre.length < 8) return null;
  const pays = propre.slice(0, 2);
  const fin = propre.slice(-4);
  return `${pays}•• •••• •••• ${fin}`;
}

function lire(cle: string): string | null {
  const valeur = process.env[cle];
  if (valeur === undefined) return null;
  const propre = valeur.trim();
  return propre.length > 0 ? propre : null;
}

export function identiteLegale(): IdentiteLegale {
  return {
    raisonSociale: lire('IGNITUX_RAISON_SOCIALE'),
    adresse: lire('IGNITUX_ADRESSE'),
    email: lire('IGNITUX_EMAIL'),
    identifiant: lire('IGNITUX_IDENTIFIANT'),
    tva: lire('IGNITUX_TVA'),
    bic: lire('IGNITUX_BIC'),
  };
}

/**
 * L'identité telle qu'elle peut être publiée, IBAN masqué compris.
 *
 * C'est cette forme que servent les routes et les factures. Il n'existe
 * volontairement aucun chemin où l'IBAN complet transite par une réponse
 * HTTP : le jour où un virement devra être proposé, il passera par un
 * fournisseur de paiement, pas par un numéro affiché à l'écran.
 */
export function pourAffichage(): IdentiteLegale & { iban: string | null } {
  return { ...identiteLegale(), iban: masquerIban(lire('IGNITUX_IBAN')) };
}

/**
 * L'IBAN complet.
 *
 * Isolé dans sa propre fonction pour que `grep ibanComplet` suffise à
 * énumérer tous les endroits qui le manipulent. À n'appeler que là où un
 * virement réel l'exige, et à ne jamais journaliser.
 */
export function ibanComplet(): string | null {
  return lire('IGNITUX_IBAN');
}

/**
 * Ce qui manque pour émettre un document légal.
 *
 * Une facture sans raison sociale ni adresse n'est pas une facture
 * incomplète : c'est un document sans valeur. Mieux vaut refuser de
 * l'émettre que de le produire et l'apprendre au contrôle.
 */
export function manquePourFacturer(): string[] {
  const identite = identiteLegale();
  const manques: string[] = [];
  if (!identite.raisonSociale) manques.push('IGNITUX_RAISON_SOCIALE');
  if (!identite.adresse) manques.push('IGNITUX_ADRESSE');
  if (!identite.email) manques.push('IGNITUX_EMAIL');
  return manques;
}

/**
 * LA PATERNITÉ DU CONCEPT.
 *
 * Helder Filipe Amorim Simões a conçu Ignitux. C'est un fait daté, pas une
 * clause : il ne dépend d'aucun contrat et ne s'annule pas avec une vente.
 * En droit français, ce que la cession transfère est le patrimoine — les
 * parts, la marque, le code ; le droit moral de l'auteur, lui, est
 * inaliénable et perpétuel.
 *
 * **Ce que ce fichier peut faire :** porter cette mention là où elle se lit,
 * et la rendre difficile à retirer par inadvertance — un test la vérifie.
 *
 * **Ce qu'il ne peut pas faire :** garantir quoi que ce soit juridiquement.
 * Une constante dans un dépôt n'oblige personne. La protection réelle passe
 * par les statuts, un dépôt de marque et un pacte d'associés, et c'est à un
 * avocat de l'écrire — pas à ce fichier.
 */
export const CREATEUR = 'Helder Filipe Amorim Simões';

export const MENTION_PATERNITE =
  `Ignitux a été conçu par ${CREATEUR}. ` +
  "La paternité du concept lui appartient et ne se transfère pas : une cession peut " +
  'changer le propriétaire des parts, de la marque ou du code, pas celui qui en a eu ' +
  "l'idée.";
