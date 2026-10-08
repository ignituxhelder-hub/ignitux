/**
 * PIÈCES DU DOSSIER DE CRÉATION — calcul pur, sans base ni Nest.
 *
 * Tout est recalculé à la volée depuis l'état du projet : rien n'est stocké
 * sur l'état d'une pièce, sauf les cases que la personne coche elle-même
 * (les pièces qu'Ignitux ne peut pas connaître). Voir la spec
 * docs/superpowers/specs/2026-10-08-dossier-creation-design.md.
 */

export const FORMES_SOCIETE = ['EURL', 'SASU', 'SARL', 'SAS'] as const;
export const FORMES_INDIVIDUELLES = ['micro-entreprise', 'EI'] as const;

/** Les seules pièces que la personne coche à la main. */
export const PIECES_COCHABLES = ['justificatif_siege', 'capital_depose', 'declaration_beneficiaires'] as const;
export type PieceCochable = (typeof PIECES_COCHABLES)[number];

export type PieceId =
  | 'forme_confirmee'
  | 'statuts'
  | 'identite'
  | 'mandat'
  | PieceCochable;

export type EtatPiece = 'pret' | 'a_faire' | 'non_concerne';

export type FamilleForme = 'societe' | 'individuelle';

export interface Piece {
  id: PieceId;
  titre: string;
  etat: EtatPiece;
  detail: string;
  /** Vrai pour les pièces que la personne peut cocher elle-même (PATCH) pour cette forme. */
  cochable: boolean;
}

export interface SourcesPieces {
  /** `projects.confirmed_legal_form`. */
  forme: string | null;
  /** `company_bylaws` du projet, s'il existe. */
  statuts: { status: string } | null;
  /** Vérifications d'identité du propriétaire, la plus récente d'abord. */
  identites: readonly { status: string }[];
  /** Un mandat du projet `active` et signé (`signed_at` non nul). */
  mandatActifSigne: boolean;
  /** `creation_filings.checked_items`. */
  piecesCochees: readonly string[];
}

/** Famille de la forme confirmée ; null si aucune forme reconnue n'est posée. */
export function familleDeForme(forme: string | null): FamilleForme | null {
  if (!forme) return null;
  if ((FORMES_SOCIETE as readonly string[]).includes(forme)) return 'societe';
  if ((FORMES_INDIVIDUELLES as readonly string[]).includes(forme)) return 'individuelle';
  return null;
}

/** Les pièces cochables qui s'appliquent à cette forme (aucune sans forme confirmée). */
export function piecesCochablesPourForme(forme: string | null): PieceCochable[] {
  const famille = familleDeForme(forme);
  if (famille === 'societe') return [...PIECES_COCHABLES];
  if (famille === 'individuelle') return ['justificatif_siege'];
  return [];
}

function pieceIdentite(identites: SourcesPieces['identites']): Piece {
  const base = { id: 'identite' as const, titre: 'Pièce d’identité vérifiée', cochable: false };
  if (identites.some((v) => v.status === 'validee')) {
    return { ...base, etat: 'pret', detail: 'Ton identité a été vérifiée.' };
  }
  const derniere = identites[0];
  if (derniere?.status === 'en_attente') {
    return { ...base, etat: 'a_faire', detail: 'Vérification en cours : ta pièce d’identité est en attente de relecture.' };
  }
  if (derniere?.status === 'rejetee') {
    return {
      ...base,
      etat: 'a_faire',
      detail: 'Ta dernière pièce d’identité a été refusée : envoie-en une nouvelle depuis ton compte.',
    };
  }
  return { ...base, etat: 'a_faire', detail: 'Fais vérifier ta pièce d’identité depuis ton compte.' };
}

function pieceCochee(
  id: PieceCochable,
  titre: string,
  coche: boolean,
  detailAFaire: string,
): Piece {
  return coche
    ? { id, titre, etat: 'pret', detail: 'Tu as indiqué que cette pièce est prête.', cochable: true }
    : { id, titre, etat: 'a_faire', detail: detailAFaire, cochable: true };
}

function nonConcernee(id: PieceCochable | 'statuts', titre: string): Piece {
  return {
    id,
    titre,
    etat: 'non_concerne',
    detail: 'Pas nécessaire pour une micro-entreprise ou une entreprise individuelle.',
    cochable: false,
  };
}

/**
 * La liste des pièces, dans l'ordre d'affichage.
 *
 * Sans forme confirmée (ou forme inconnue), la liste se limite à
 * `forme_confirmee: a_faire` : tout le reste dépend de la forme.
 */
export function calculerPieces(sources: SourcesPieces): Piece[] {
  const famille = familleDeForme(sources.forme);
  if (!famille) {
    return [
      {
        id: 'forme_confirmee',
        titre: 'Forme juridique confirmée',
        etat: 'a_faire',
        detail: 'Confirme la forme juridique du projet : la liste des pièces en dépend.',
        cochable: false,
      },
    ];
  }

  const cochees = new Set(sources.piecesCochees);
  const societe = famille === 'societe';
  const pieces: Piece[] = [
    {
      id: 'forme_confirmee',
      titre: 'Forme juridique confirmée',
      etat: 'pret',
      detail: `Forme retenue : ${sources.forme}.`,
      cochable: false,
    },
  ];

  if (!societe) {
    pieces.push(nonConcernee('statuts', 'Statuts de la société'));
  } else if (sources.statuts?.status === 'retenue') {
    pieces.push({ id: 'statuts', titre: 'Statuts de la société', etat: 'pret', detail: 'Tu as retenu une version des statuts.', cochable: false });
  } else if (sources.statuts) {
    pieces.push({
      id: 'statuts',
      titre: 'Statuts de la société',
      etat: 'a_faire',
      detail: 'Tes statuts sont en brouillon : relis-les puis retiens une version.',
      cochable: false,
    });
  } else {
    pieces.push({
      id: 'statuts',
      titre: 'Statuts de la société',
      etat: 'a_faire',
      detail: 'Génère puis retiens les statuts de ta société.',
      cochable: false,
    });
  }

  pieces.push(pieceIdentite(sources.identites));

  // Informatif, jamais bloquant : c'est la personne qui dépose, le mandat
  // n'est pas utilisé dans ce lot.
  pieces.push(
    sources.mandatActifSigne
      ? { id: 'mandat', titre: 'Mandat signé (facultatif)', etat: 'pret', detail: 'Tu as signé un mandat pour ce projet. Le dépôt reste fait par toi.', cochable: false }
      : {
          id: 'mandat',
          titre: 'Mandat signé (facultatif)',
          etat: 'non_concerne',
          detail: 'Facultatif : tu déposes ton dossier toi-même, aucun mandat n’est nécessaire.',
          cochable: false,
        },
  );

  pieces.push(
    pieceCochee(
      'justificatif_siege',
      'Justificatif de domiciliation (siège)',
      cochees.has('justificatif_siege'),
      'Prépare un justificatif de l’adresse de l’entreprise (bail, contrat de domiciliation, justificatif de domicile…), puis coche la case.',
    ),
  );

  if (societe) {
    pieces.push(
      pieceCochee(
        'capital_depose',
        'Attestation de dépôt du capital',
        cochees.has('capital_depose'),
        'Dépose le capital (banque, notaire ou Caisse des dépôts) et garde l’attestation, puis coche la case.',
      ),
      pieceCochee(
        'declaration_beneficiaires',
        'Déclaration des bénéficiaires effectifs',
        cochees.has('declaration_beneficiaires'),
        'Prépare la liste des personnes qui détiennent ou contrôlent la société, puis coche la case.',
      ),
    );
  } else {
    pieces.push(
      nonConcernee('capital_depose', 'Attestation de dépôt du capital'),
      nonConcernee('declaration_beneficiaires', 'Déclaration des bénéficiaires effectifs'),
    );
  }

  return pieces;
}
