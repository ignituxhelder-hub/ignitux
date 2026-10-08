import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../roles/roles.service.js';
import { type DocumentType, type FaceDocument } from './dto/identite.dto.js';
import { extraireChampsStructures } from './champs-extraits.js';
import { extraireTexte } from './ocr-extraction.js';

/**
 * Les octets bruts des pièces ne sortent jamais dans une réponse JSON de
 * liste, de création ou de revue : Prisma 7 sérialise `Bytes` en
 * `Uint8Array`, que `JSON.stringify` transforme en objet `{"0":…}` environ
 * 13 fois plus lourd que le fichier — et que le cache hors ligne du
 * frontend recopierait ensuite dans le navigateur. Seul `lireDocument` y
 * donne accès, une face à la fois, au propriétaire ou à un administrateur.
 */
const SANS_OCTETS = { document_front: true, document_back: true } as const;

export type TypeImage = 'image/png' | 'image/jpeg' | 'application/octet-stream';

/**
 * Type MIME déduit des premiers octets. Suffisant ici : l'upload n'accepte
 * que JPEG et PNG (`fileFilter` du contrôleur), inutile de stocker le type
 * d'origine dans une colonne de plus. Tout autre contenu retombe sur un
 * type binaire neutre plutôt que d'être présenté comme une image.
 */
export function typeImage(octets: Uint8Array): TypeImage {
  if (
    octets.length >= 4 &&
    octets[0] === 0x89 &&
    octets[1] === 0x50 &&
    octets[2] === 0x4e &&
    octets[3] === 0x47
  ) {
    return 'image/png';
  }
  if (octets.length >= 2 && octets[0] === 0xff && octets[1] === 0xd8) {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}

/**
 * Un dossier signalé (MRZ invalide ou nom incohérent) passe en tête de la
 * file de revue. `null` n'est pas un signal — seulement une absence de MRZ
 * détectée ou de nom de compte — et ne fait donc pas remonter le dossier.
 */
function estSignale(v: { mrz_checksum_valid: boolean | null; name_matches_account: boolean | null }) {
  return v.mrz_checksum_valid === false || v.name_matches_account === false;
}

/**
 * IDENTITÉ ET MANDATS — la brique de confiance sur laquelle s'appuiera un
 * jour un dépôt réel auprès de l'INPI/guichet unique (sous-projet 3 du
 * chantier « Ignitux crée l'entreprise »). Ce service ne dépose rien : il
 * vérifie qui est la personne et enregistre l'autorisation qu'elle donne.
 */
@Injectable()
export class IdentiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  async soumettreDocument(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
    nomCompte: string | null,
  ) {
    // Le passeport n'a qu'une page à présenter ; carte d'identité et titre
    // de séjour ont un recto et un verso, tous deux nécessaires pour lire
    // le nom (souvent au verso sur les anciens modèles).
    if (documentType !== 'passeport' && !back) {
      throw new BadRequestException(
        `Un ${documentType === 'carte_identite' ? 'recto ET un verso' : 'recto et un verso'} sont requis pour ce type de document.`,
      );
    }

    const texteOcr = await extraireTexte(front);
    const champs = extraireChampsStructures(texteOcr);
    const nomCoherent = this.comparerNoms(nomCompte, texteOcr);
    // Seul contrôle qui court-circuite la revue humaine : la spec est
    // explicite là-dessus (« pas besoin d'attendre une revue humaine pour
    // ce cas-là »), contrairement à une incohérence de nom qui, elle,
    // signale seulement pour priorité de revue sans jamais rejeter seule.
    const expire = champs.dateExpiration ? champs.dateExpiration.getTime() < Date.now() : false;

    return this.prisma.identity_verifications.create({
      data: {
        owner_id: ownerId,
        document_type: documentType,
        // Prisma 7 type `Bytes` en `Uint8Array<ArrayBuffer>`, plus strict
        // qu'un simple `Buffer` (voir la correction du même ordre faite en
        // Task 3) : conversion explicite nécessaire pour `tsc --noEmit`.
        document_front: new Uint8Array(front),
        document_back: back ? new Uint8Array(back) : null,
        status: expire ? 'rejetee' : 'en_attente',
        rejection_reason: expire ? 'Document expiré.' : null,
        mrz_checksum_valid: champs.mrzValide,
        name_matches_account: nomCoherent,
        // Champs bruts tirés de la MRZ, en plus du booléen mrz_checksum_valid
        // dérivé : la revue humaine (Task 5/9) doit pouvoir voir ce que la
        // MRZ dit réellement, pas seulement si son chiffre de contrôle est
        // valide. `undefined` (aucune MRZ TD3 détectée) devient `null` ici —
        // Prisma n'accepte pas `undefined` comme valeur de colonne nullable.
        extracted_document_number: champs.numeroDocument ?? null,
        extracted_birth_date: champs.dateNaissance ?? null,
        extracted_expiry_date: champs.dateExpiration ?? null,
      },
      omit: SANS_OCTETS,
    });
  }

  /**
   * Compare le nom du compte au texte OCR brut, en normalisant casse et
   * accents. `null` quand le compte n'a pas de nom affiché — une absence
   * de signal, jamais une incohérence par défaut. Un vrai rapprochement
   * champ à champ (une fois `champs-extraits.ts` étendu à l'extraction du
   * nom lui-même) affinera ceci dans une itération suivante ; en
   * attendant, un simple test de présence du nom normalisé dans le texte
   * OCR reste un signal utile pour prioriser la revue humaine.
   */
  private comparerNoms(nomCompte: string | null, texteOcr: string): boolean | null {
    if (!nomCompte || nomCompte.trim().length === 0) return null;
    // \p{Diacritic} (échappement Unicode, flag `u`) plutôt qu'une plage de
    // points de code écrite en dur : plus lisible, et insensible à tout
    // problème d'encodage qui pourrait corrompre des caractères combinants
    // recopiés tels quels dans le code source.
    const normalise = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
    return normalise(texteOcr).includes(normalise(nomCompte));
  }

  /**
   * Point d'entrée du contrôleur : résout le nom du compte (`display_name`
   * du profil, absent du token JWT) puis délègue à `soumettreDocument`.
   * Séparé plutôt que de faire porter cette résolution au contrôleur lui-
   * même, pour ne pas lui faire injecter `PrismaService` en plus du
   * service — redondant, et une dépendance de plus à mocker dans ses tests.
   */
  async soumettreDocumentPourUtilisateur(
    ownerId: string,
    documentType: DocumentType,
    front: Buffer,
    back: Buffer | null,
  ) {
    const profil = await this.prisma.user_profiles.findUnique({
      where: { user_id: ownerId },
      select: { display_name: true },
    });
    return this.soumettreDocument(ownerId, documentType, front, back, profil?.display_name ?? null);
  }

  listerMesVerifications(ownerId: string) {
    return this.prisma.identity_verifications.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
      omit: SANS_OCTETS,
    });
  }

  /**
   * Une face de pièce d'identité, en binaire, pour l'aperçu. Réservé au
   * propriétaire de la vérification ou à un `administrateur` (la revue
   * humaine doit voir la pièce pour trancher). Un tiers reçoit le même 404
   * qu'une vérification inexistante : lui répondre 403 confirmerait que
   * l'identifiant existe.
   *
   * Une seule colonne d'octets est lue (`select`), jamais les deux : un
   * aperçu du recto n'a aucune raison de charger aussi le verso en mémoire.
   */
  async lireDocument(
    demandeurId: string,
    verificationId: string,
    face: FaceDocument,
  ): Promise<{ contenu: Buffer; type: TypeImage }> {
    const verification =
      face === 'front'
        ? await this.prisma.identity_verifications
            .findFirst({
              where: { id: verificationId },
              select: { owner_id: true, document_front: true },
            })
            .then((v) => v && { owner_id: v.owner_id, octets: v.document_front })
        : await this.prisma.identity_verifications
            .findFirst({
              where: { id: verificationId },
              select: { owner_id: true, document_back: true },
            })
            .then((v) => v && { owner_id: v.owner_id, octets: v.document_back });
    if (!verification) {
      throw new NotFoundException('Vérification introuvable.');
    }
    if (
      verification.owner_id !== demandeurId &&
      !(await this.roles.holdsRole(demandeurId, 'administrateur'))
    ) {
      throw new NotFoundException('Vérification introuvable.');
    }

    const { octets } = verification;
    if (!octets) {
      throw new NotFoundException(
        face === 'back' ? "Cette vérification n'a pas de verso." : 'Recto introuvable.',
      );
    }
    return { contenu: Buffer.from(octets), type: typeImage(octets) };
  }

  async findVerificationForOwner(ownerId: string, verificationId: string) {
    const verification = await this.prisma.identity_verifications.findFirst({
      where: { id: verificationId, owner_id: ownerId },
    });
    if (!verification) {
      throw new NotFoundException('Vérification introuvable.');
    }
    return verification;
  }

  /**
   * La file de revue : tout ce dont l'administrateur a besoin pour trancher
   * (champs extraits, signaux de fraude, qui a déposé), sauf les octets des
   * pièces, servis à part par `lireDocument`.
   *
   * Forme de chaque élément : les colonnes sélectionnées ci-dessous, plus
   * `a_un_verso` (booléen) et `owner: { email, display_name }` (aplati
   * depuis `owner.profile.display_name`, `null` sans profil).
   *
   * Ordre : dossiers signalés d'abord, puis les autres ; le plus ancien
   * d'abord à l'intérieur de chaque groupe (tri stable sur la liste déjà
   * ordonnée par `created_at`).
   */
  async listerEnAttente() {
    const [lignes, avecVerso] = await Promise.all([
      this.prisma.identity_verifications.findMany({
        where: { status: 'en_attente' },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          document_type: true,
          status: true,
          created_at: true,
          extracted_document_number: true,
          extracted_birth_date: true,
          extracted_expiry_date: true,
          mrz_checksum_valid: true,
          name_matches_account: true,
          owner: { select: { email: true, profile: { select: { display_name: true } } } },
        },
      }),
      // Savoir s'il existe un verso sans lire ses octets : un simple test
      // IS NOT NULL côté Postgres, qui ne renvoie que des identifiants.
      this.prisma.identity_verifications.findMany({
        where: { status: 'en_attente', document_back: { not: null } },
        select: { id: true },
      }),
    ]);
    const idsAvecVerso = new Set(avecVerso.map((v) => v.id));

    const file = lignes.map(({ owner, ...v }) => ({
      ...v,
      a_un_verso: idsAvecVerso.has(v.id),
      owner: { email: owner.email, display_name: owner.profile?.display_name ?? null },
    }));
    return [...file.filter(estSignale), ...file.filter((v) => !estSignale(v))];
  }

  /**
   * La revue humaine : la spec la traite comme obligatoire avant qu'une
   * vérification ne compte comme validée, quel que soit ce que l'OCR/MRZ
   * (Tasks 3-4) a déjà établi. `en_attente` seulement — une fois tranchée,
   * la décision ne se reprend pas (ConflictException plutôt que d'écraser
   * silencieusement un rejet par une validation ou inversement).
   * `adminId` est consigné dans `reviewed_by` : la trace de qui a tranché.
   */
  async revoirVerification(
    adminId: string,
    verificationId: string,
    decision: 'validee' | 'rejetee',
    motif?: string,
  ) {
    const verification = await this.prisma.identity_verifications.findFirst({
      where: { id: verificationId },
      select: { id: true, status: true },
    });
    if (!verification) {
      throw new NotFoundException('Vérification introuvable.');
    }
    if (verification.status !== 'en_attente') {
      throw new ConflictException(
        `Cette vérification est déjà ${verification.status} : une décision ne se reprend pas.`,
      );
    }
    if (decision === 'rejetee' && !motif) {
      throw new BadRequestException('Un motif est requis pour rejeter une vérification.');
    }

    return this.prisma.identity_verifications.update({
      where: { id: verificationId },
      data: {
        status: decision,
        rejection_reason: decision === 'rejetee' ? motif : null,
        // Trace d'audit : qui a tranché, pas seulement quand.
        reviewed_by: adminId,
        reviewed_at: new Date(),
      },
      omit: SANS_OCTETS,
    });
  }
}
