import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHOIX_ACCES_ARGENT } from './acces-argent.js';
import { accesProjet, exigerCapacite } from './acces-projet.js';
import { estRoleArgent } from './domaines.js';
import { capacitesDe, estRoleEquipe, ROLE_LABEL, type RoleEquipe } from './droits-equipe.js';

/**
 * Ce que l'accès à l'argent du propriétaire veut dire, pour les rôles qui
 * l'ouvrent. Automatique : inviter comme comptable ou associé enregistre
 * l'accès (`'argent_auto'`, voir `acces-argent.ts`) ; c'est ce texte qui en
 * informe la personne invitée.
 */
const ACCES_ARGENT = 'accès automatique, que le propriétaire peut couper à tout moment';

/** Ce que chaque rôle fait, en une phrase, pour l'email d'invitation. */
const DESCRIPTION: Record<RoleEquipe, string> = {
  associe:
    'tu peux voir et modifier le projet et lancer IGINI, et travailler dans la facturation, la comptabilité, ' +
    `la banque et la caisse du propriétaire (${ACCES_ARGENT}) ; le financement et les actes juridiques ` +
    'restent au propriétaire.',
  salarie: 'tu peux voir le projet et travailler sur ses tâches.',
  comptable:
    'tu peux travailler dans la facturation, la comptabilité, la banque et la caisse du propriétaire ' +
    `(${ACCES_ARGENT}), et voir le financement, l’évaluation de financement et les documents juridiques du projet.`,
  observateur: 'tu peux tout voir, sans rien modifier.',
};

/**
 * L'ÉQUIPE D'UN PROJET — inviter avec un rôle, changer un rôle, retirer.
 *
 * Seul le propriétaire gère l'équipe (`gerer_equipe`). Tout membre peut voir
 * qui en fait partie.
 *
 * Inviter quelqu'un comme comptable ou associé, ou lui donner l'un de ces
 * rôles, c'est aussi consentir à son accès à l'argent du propriétaire
 * (facturation, comptabilité, banque, caisse) : les textes des rôles le
 * disent au moment du geste. Le consentement est enregistré à ce moment-là
 * (`accorderAccesArgent`), jamais déduit d'une date.
 */
@Injectable()
export class EquipeService {
  private readonly logger = new Logger(EquipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async monAcces(userId: string, projectId: string) {
    const { role } = await accesProjet(this.prisma, userId, projectId);
    return { role, capacites: [...capacitesDe(role)] };
  }

  async lister(userId: string, projectId: string) {
    await accesProjet(this.prisma, userId, projectId);
    return this.prisma.project_collaborators.findMany({
      where: { project_id: projectId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async inviter(ownerId: string, projectId: string, email: string, roleDemande = 'observateur') {
    const role = this.roleValide(roleDemande);
    const { ownerId: proprietaire } = await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');

    const user = await this.prisma.users.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Aucun compte ne correspond à cet email.');
    if (user.id === ownerId) {
      throw new BadRequestException('Le propriétaire du projet ne peut pas être ajouté comme collaborateur.');
    }
    const existant = await this.prisma.project_collaborators.findFirst({
      where: { project_id: projectId, user_id: user.id },
    });
    if (existant) throw new BadRequestException('Cette personne collabore déjà sur ce projet.');

    const membre = await this.prisma.project_collaborators.create({
      data: { project_id: projectId, user_id: user.id, role },
      include: { user: { select: { id: true, email: true } } },
    });
    // Avant l'e-mail : quand il arrive, l'accès annoncé est déjà là.
    if (estRoleArgent(role)) await this.accorderAccesArgent(proprietaire, user.id);
    await this.prevenir(user.email, projectId, role);
    return membre;
  }

  async changerRole(ownerId: string, projectId: string, memberUserId: string, roleDemande: string) {
    const role = this.roleValide(roleDemande);
    const { ownerId: proprietaire } = await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');
    const { count } = await this.prisma.project_collaborators.updateMany({
      where: { project_id: projectId, user_id: memberUserId },
      data: { role },
    });
    if (count === 0) throw new NotFoundException('Cette personne ne fait pas partie de l’équipe du projet.');
    // Passé comptable ou associé (y compris de l'un à l'autre) : même
    // consentement qu'à l'invitation.
    if (estRoleArgent(role)) await this.accorderAccesArgent(proprietaire, memberUserId);
  }

  /**
   * Retire la personne du projet. Son accès à l'argent du propriétaire
   * (`space_members`) n'est PAS supprimé : il dépend déjà de son rôle actuel
   * (plus comptable ni associée sur aucun projet du propriétaire, elle le
   * perd à la requête suivante). Si elle le redevient, le choix enregistré
   * s'applique de nouveau — un accès coupé reste coupé.
   */
  async retirer(ownerId: string, projectId: string, memberUserId: string) {
    await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');
    await this.prisma.project_collaborators.deleteMany({
      where: { project_id: projectId, user_id: memberUserId },
    });
  }

  /**
   * LE CONSENTEMENT DU PROPRIÉTAIRE À L'ACCÈS À SON ARGENT, pris au geste :
   * inviter comme comptable ou associé, ou donner l'un de ces rôles.
   *
   * Crée la ligne `space_members` (propriétaire, membre) avec `'argent_auto'`
   * SEULEMENT SI AUCUNE LIGNE N'EXISTE (`INSERT … ON CONFLICT DO NOTHING`,
   * atomique) : un choix explicite du propriétaire — `'argent'` activé,
   * `'refuse'` coupé — n'est jamais écrasé.
   *
   * Pas de transaction autour de l'invitation : écrit juste après. Ne lève
   * jamais — un échec n'annule ni l'invitation ni le changement de rôle ; il
   * est journalisé, et la personne reste « à activer » (côté prudent) : le
   * propriétaire peut l'activer lui-même.
   */
  private async accorderAccesArgent(ownerId: string, memberId: string): Promise<void> {
    const membre = memberId.toLowerCase();
    // Jamais membre de son propre argent, même si la base le permettait.
    if (membre === ownerId.toLowerCase()) return;
    try {
      await this.prisma.space_members.createMany({
        data: [{ owner_id: ownerId, member_id: membre, role: CHOIX_ACCES_ARGENT.automatique }],
        skipDuplicates: true,
      });
    } catch (erreur) {
      this.logger.error(
        `Accès à l’argent de ${ownerId} pour ${membre} : consentement non enregistré (reste à activer) — ${String(erreur)}`,
      );
    }
  }

  private roleValide(role: string): RoleEquipe {
    if (!estRoleEquipe(role)) {
      throw new BadRequestException('Rôle inconnu : choisis Associé, Salarié, Comptable ou Observateur.');
    }
    return role;
  }

  /** Ne lève jamais : un email qui ne part pas n'annule pas l'invitation. */
  private async prevenir(email: string, projectId: string, role: RoleEquipe): Promise<void> {
    try {
      const projet = await this.prisma.projects.findUnique({ where: { id: projectId }, select: { title: true } });
      const titre = projet?.title ?? 'un projet';
      await this.mail.send({
        to: email,
        subject: `Tu rejoins l’équipe du projet « ${titre} » sur Ignitux`,
        text:
          `Tu as été ajouté à l’équipe du projet « ${titre} » comme ${ROLE_LABEL[role]} : ` +
          `${DESCRIPTION[role]}\n\nConnecte-toi pour le retrouver :\n${getEnv().FRONTEND_URL}\n`,
      });
    } catch (erreur) {
      this.logger.error(`Invitation ${email} : email non envoyé — ${String(erreur)}`);
    }
  }
}
