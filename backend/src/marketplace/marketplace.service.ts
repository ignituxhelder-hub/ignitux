import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MarketplaceRole } from './marketplace-role.js';

/**
 * MARKETPLACE — annuaire de mentors/investisseurs et mise en relation par
 * message. Volontairement sans aucune circulation d'argent (pas de
 * paiement, pas de gestion de participation) — voir docs/decisions.md pour
 * pourquoi : au-delà d'un simple annuaire, des transactions réelles
 * impliqueraient des obligations légales (KYC, DSP2…) hors de portée sans
 * cadrage produit/juridique explicite.
 */
@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  upsertProfile(
    userId: string,
    role: MarketplaceRole,
    headline: string,
    bio?: string,
    expertise: string[] = [],
  ) {
    return this.prisma.marketplace_profiles.upsert({
      where: { user_id: userId },
      update: { role, headline, bio, expertise },
      create: { user_id: userId, role, headline, bio, expertise },
    });
  }

  async listProfiles(role?: MarketplaceRole) {
    return this.prisma.marketplace_profiles.findMany({
      where: role ? { role } : undefined,
      include: { user: { select: { id: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async getOwnProfile(userId: string) {
    return this.prisma.marketplace_profiles.findUnique({ where: { user_id: userId } });
  }

  async removeOwnProfile(userId: string) {
    await this.prisma.marketplace_profiles.deleteMany({ where: { user_id: userId } });
  }

  async contactProfile(fromUserId: string, profileId: string, message: string) {
    const profile = await this.prisma.marketplace_profiles.findUnique({ where: { id: profileId } });
    if (!profile) {
      throw new NotFoundException('Profil introuvable.');
    }
    if (profile.user_id === fromUserId) {
      throw new BadRequestException('Impossible de se contacter soi-même.');
    }

    return this.prisma.marketplace_contacts.create({
      data: { from_user_id: fromUserId, to_profile_id: profileId, message },
    });
  }

  // Uniquement les messages reçus par le propriétaire du profil — pas
  // d'accès aux messages adressés à d'autres profils.
  async listReceivedContacts(userId: string) {
    const profile = await this.prisma.marketplace_profiles.findUnique({ where: { user_id: userId } });
    if (!profile) {
      return [];
    }

    return this.prisma.marketplace_contacts.findMany({
      where: { to_profile_id: profile.id },
      include: { from_user: { select: { id: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });
  }
}
