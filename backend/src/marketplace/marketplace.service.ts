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

  /**
   * L'annuaire des mentors et investisseurs.
   *
   * Il renvoyait l'**adresse email** de chaque inscrit, à n'importe quelle
   * personne connectée : une requête, tout l'annuaire. Et l'interface ne
   * l'affichait nulle part — une exposition sans le moindre usage, ce qui est
   * la pire des deux moitiés.
   *
   * Elle n'est pas nécessaire au dispositif : le produit a justement une mise
   * en relation interne (`contactProfile`) pour qu'on puisse écrire à
   * quelqu'un sans connaître son adresse. L'article 13 dit que les données
   * privées sont protégées par défaut ; une adresse email en est une, et un
   * annuaire qui les distribue est un champ à moissonner.
   *
   * Ce qui reste : l'identifiant de la personne — nécessaire pour savoir si un
   * profil est le sien — et son nom d'affichage, celui qu'elle a choisi de
   * montrer.
   */
  async listProfiles(role?: MarketplaceRole) {
    return this.prisma.marketplace_profiles.findMany({
      where: role ? { role } : undefined,
      include: {
        user: { select: { id: true, profile: { select: { display_name: true } } } },
      },
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

    // Ici l'adresse reste, et c'est délibéré : quelqu'un qui reçoit un
    // message doit pouvoir y répondre, et le produit n'a pas de messagerie
    // interne. Ce n'est pas une fuite — c'est le canal de retour, ouvert par
    // la personne qui a écrit la première. Elle en est prévenue au moment
    // d'écrire (voir l'écran Place de marché), ce qui fait la différence
    // entre une adresse donnée et une adresse prise.
    return this.prisma.marketplace_contacts.findMany({
      where: { to_profile_id: profile.id },
      include: { from_user: { select: { id: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });
  }
}
