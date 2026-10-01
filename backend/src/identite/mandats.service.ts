import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnsProject } from '../prisma/assert-owns-project.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEXTE_MANDAT } from './mandate-text.js';

@Injectable()
export class MandatsService {
  constructor(private readonly prisma: PrismaService) {}

  async creerMandat(ownerId: string, projectId: string, purpose: string) {
    await assertOwnsProject(this.prisma, ownerId, projectId);

    const verification = await this.prisma.identity_verifications.findFirst({
      where: { owner_id: ownerId, status: 'validee' },
      orderBy: { created_at: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException(
        "Aucune vérification d'identité validée pour ce compte : signe d'abord ton identité sur /identite.",
      );
    }

    return this.prisma.mandates.create({
      data: {
        owner_id: ownerId,
        project_id: projectId,
        identity_verification_id: verification.id,
        purpose,
        status: 'active',
        // mandate_text/signed_full_name/signed_at/signer_ip restent null
        // jusqu'à signerMandat : un mandat créé mais pas encore signé est
        // un état réel, pas une absence de données à masquer.
      },
    });
  }

  listerMesMandats(ownerId: string) {
    return this.prisma.mandates.findMany({
      where: { owner_id: ownerId },
      orderBy: { created_at: 'desc' },
    });
  }

  async signerMandat(ownerId: string, mandateId: string, nomComplet: string, ip: string) {
    const mandat = await this.findMandatForOwner(ownerId, mandateId);
    if (mandat.signed_at) {
      throw new ConflictException('Ce mandat est déjà signé.');
    }

    return this.prisma.mandates.update({
      where: { id: mandateId },
      data: {
        mandate_text: TEXTE_MANDAT,
        signed_full_name: nomComplet,
        signed_at: new Date(),
        signer_ip: ip,
      },
    });
  }

  async revoquerMandat(ownerId: string, mandateId: string) {
    const mandat = await this.findMandatForOwner(ownerId, mandateId);
    if (mandat.status === 'revoquee') {
      throw new ConflictException('Ce mandat est déjà révoqué.');
    }

    return this.prisma.mandates.update({
      where: { id: mandateId },
      data: { status: 'revoquee', revoked_at: new Date() },
    });
  }

  private async findMandatForOwner(ownerId: string, mandateId: string) {
    const mandat = await this.prisma.mandates.findFirst({
      where: { id: mandateId, owner_id: ownerId },
    });
    if (!mandat) {
      throw new NotFoundException('Mandat introuvable.');
    }
    return mandat;
  }
}
