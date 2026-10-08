import { familleDeForme } from './pieces.js';

/**
 * GUIDE PAS À PAS DU DÉPÔT — données statiques.
 *
 * Ignitux ne dépose rien et ne paie rien : ces étapes décrivent ce que la
 * personne fait elle-même. Les liens pointent vers des sites officiels
 * (ou, pour le Kbis, le portail des greffes).
 */

export interface Etape {
  id: string;
  titre: string;
  texte: string;
  lien: string;
  lienLibelle: string;
}

const GUICHET_UNIQUE = 'https://formalites.entreprises.gouv.fr';
const SERVICE_PUBLIC_ENTREPRENDRE = 'https://entreprendre.service-public.fr';

export const ETAPES_SOCIETE: readonly Etape[] = [
  {
    id: 'statuts',
    titre: 'Rédiger et retenir les statuts',
    texte:
      'Relis le brouillon de statuts, corrige-le si besoin, puis retiens la version finale. ' +
      'Fais-la relire par un professionnel avant de la signer.',
    lien: SERVICE_PUBLIC_ENTREPRENDRE,
    lienLibelle: 'Entreprendre.Service-Public.fr',
  },
  {
    id: 'capital',
    titre: 'Déposer le capital',
    texte:
      'Verse les apports en numéraire sur un compte bloqué (banque, notaire ou Caisse des dépôts). ' +
      'Tu reçois une attestation de dépôt : garde-la, elle fait partie du dossier.',
    lien: 'https://consignations.caissedesdepots.fr',
    lienLibelle: 'Caisse des dépôts — consignations',
  },
  {
    id: 'annonce',
    titre: 'Publier l’annonce légale',
    texte:
      'Publie l’avis de constitution dans un support habilité à recevoir les annonces légales ' +
      'du département du siège. Garde l’attestation de parution.',
    lien: SERVICE_PUBLIC_ENTREPRENDRE,
    lienLibelle: 'Entreprendre.Service-Public.fr',
  },
  {
    id: 'depot',
    titre: 'Déposer le dossier au guichet unique',
    texte:
      'Crée ton compte sur le guichet unique, remplis la déclaration de création et joins les pièces ' +
      '(statuts signés, attestation de dépôt du capital, attestation de parution, justificatif de siège, ' +
      'pièce d’identité, déclaration des bénéficiaires effectifs). C’est toi qui déposes et qui paies les frais.',
    lien: GUICHET_UNIQUE,
    lienLibelle: 'Guichet unique (formalites.entreprises.gouv.fr)',
  },
  {
    id: 'kbis',
    titre: 'Recevoir le Kbis et le numéro SIREN',
    texte:
      'Une fois le dossier validé, la société est immatriculée : tu reçois son numéro SIREN et tu peux ' +
      'obtenir l’extrait Kbis.',
    lien: 'https://www.infogreffe.fr',
    lienLibelle: 'Infogreffe',
  },
];

export const ETAPES_INDIVIDUELLES: readonly Etape[] = [
  {
    id: 'declaration',
    titre: 'Déclarer l’activité au guichet unique',
    texte:
      'Crée ton compte sur le guichet unique et remplis la déclaration de début d’activité, avec ta pièce ' +
      'd’identité et un justificatif d’adresse de l’entreprise. C’est toi qui déposes.',
    lien: GUICHET_UNIQUE,
    lienLibelle: 'Guichet unique (formalites.entreprises.gouv.fr)',
  },
  {
    id: 'siren',
    titre: 'Recevoir le numéro SIREN',
    texte: 'Une fois la déclaration traitée, tu reçois ton numéro SIREN : ton entreprise existe.',
    lien: 'https://annuaire-entreprises.data.gouv.fr',
    lienLibelle: 'Annuaire des entreprises (data.gouv.fr)',
  },
];

/** Les étapes pour la forme confirmée ; aucune tant qu'aucune forme reconnue n'est posée. */
export function etapesPourForme(forme: string | null): readonly Etape[] {
  const famille = familleDeForme(forme);
  if (famille === 'societe') return ETAPES_SOCIETE;
  if (famille === 'individuelle') return ETAPES_INDIVIDUELLES;
  return [];
}

/**
 * FRAIS À PRÉVOIR — texte indicatif, jamais un montant.
 *
 * Les montants changent (arrêtés annuels, tarifs propres à chaque banque ou
 * notaire) : on annonce les postes de dépense, datés, et on renvoie vers les
 * sources officielles. Ignitux n'avance ni ne paie aucun de ces frais.
 */
export const FRAIS_MIS_A_JOUR = 'octobre 2026';

export interface Frais {
  miseAJour: string;
  lignes: string[];
  avertissement: string;
  sources: { libelle: string; url: string }[];
}

const AVERTISSEMENT_FRAIS =
  `Indications à jour en ${FRAIS_MIS_A_JOUR}, sans montant : les tarifs dépendent de la forme et de ta situation, ` +
  'peuvent varier selon le prestataire, et changent régulièrement. ' +
  'Vérifie les montants sur les sites officiels avant de payer. Ignitux n’avance ni ne paie aucun de ces frais.';

const SOURCES_FRAIS = [
  { libelle: 'Guichet unique (formalites.entreprises.gouv.fr)', url: GUICHET_UNIQUE },
  { libelle: 'Entreprendre.Service-Public.fr', url: SERVICE_PUBLIC_ENTREPRENDRE },
];

export function fraisPourForme(forme: string | null): Frais {
  const famille = familleDeForme(forme);
  const lignes =
    famille === 'societe'
      ? [
          'Annonce légale de constitution : le montant dépend de la forme et de ta situation ; vérifie-le sur les sites officiels.',
          'Frais d’immatriculation (greffe) : tarif réglementé, affiché au moment du paiement sur le guichet unique.',
          'Dépôt du capital : gratuit ou payant selon la banque, le notaire ou la Caisse des dépôts.',
          'Relecture des statuts par un professionnel (avocat, expert-comptable) : honoraires libres, facultatif mais conseillé.',
        ]
      : famille === 'individuelle'
        ? [
            'Déclaration de début d’activité : d’éventuels frais dépendent de la forme et de ta situation ; ' +
              'vérifie-les sur les sites officiels, le montant éventuel est affiché sur le guichet unique avant paiement.',
          ]
        : ['Les frais dépendent de la forme juridique : confirme-la pour voir les postes à prévoir.'];
  return { miseAJour: FRAIS_MIS_A_JOUR, lignes, avertissement: AVERTISSEMENT_FRAIS, sources: SOURCES_FRAIS };
}
