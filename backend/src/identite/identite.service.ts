import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type DocumentType } from './dto/identite.dto.js';
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

    return this.prisma.identity_verifications.create({
      data: {
        owner_id: ownerId,
        document_type: documentType,
        document_front: front,
        document_back: back,
        status: 'en_attente',
        // Task 4 remplira les champs extraits structurés à partir de
        // `texteOcr` ; pour l'instant rien n'est encore dérivé.
      },
    });
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
