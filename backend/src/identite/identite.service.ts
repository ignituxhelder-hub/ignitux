import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type DocumentType } from './dto/identite.dto.js';
import { extraireChampsStructures } from './champs-extraits.js';
import { extraireTexte } from './ocr-extraction.js';

/**
 * IDENTITÉ ET MANDATS — la brique de confiance sur laquelle s'appuiera un
 * jour un dépôt réel auprès de l'INPI/guichet unique (sous-projet 3 du
 * chantier « Ignitux crée l'entreprise »). Ce service ne dépose rien : il
 * vérifie qui est la personne et enregistre l'autorisation qu'elle donne.
 */
@Injectable()
export class IdentiteService {
  constructor(private readonly prisma: PrismaService) {}

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
    });
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
}
