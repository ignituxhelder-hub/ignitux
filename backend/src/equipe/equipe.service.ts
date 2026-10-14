import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { accesProjet, exigerCapacite } from './acces-projet.js';
import { capacitesDe, estRoleEquipe, ROLE_LABEL, type RoleEquipe } from './droits-equipe.js';

/** Ce que chaque rôle fait, en une phrase, pour l'email d'invitation. */
const DESCRIPTION: Record<RoleEquipe, string> = {
  associe:
    'tu peux voir et modifier le projet et lancer IGINI, et travailler dans la facturation, la comptabilité, ' +
    'la banque et la caisse du propriétaire ; le financement et les actes juridiques restent au propriétaire.',
  salarie: 'tu peux voir le projet et travailler sur ses tâches.',
  comptable:
    'tu peux travailler dans la facturation, la comptabilité, la banque et la caisse du propriétaire, et voir ' +
    'le financement, l’évaluation de financement et les documents juridiques du projet.',
  observateur: 'tu peux tout voir, sans rien modifier.',
};

/**
 * L'ÉQUIPE D'UN PROJET — inviter avec un rôle, changer un rôle, retirer.
 *
 * Seul le propriétaire gère l'équipe (`gerer_equipe`). Tout membre peut voir
 * qui en fait partie.
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
    await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');

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
    await this.prevenir(user.email, projectId, role);
    return membre;
  }

  async changerRole(ownerId: string, projectId: string, memberUserId: string, roleDemande: string) {
    const role = this.roleValide(roleDemande);
    await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');
    const { count } = await this.prisma.project_collaborators.updateMany({
      where: { project_id: projectId, user_id: memberUserId },
      data: { role },
    });
    if (count === 0) throw new NotFoundException('Cette personne ne fait pas partie de l’équipe du projet.');
  }

  async retirer(ownerId: string, projectId: string, memberUserId: string) {
    await exigerCapacite(this.prisma, ownerId, projectId, 'gerer_equipe');
    await this.prisma.project_collaborators.deleteMany({
      where: { project_id: projectId, user_id: memberUserId },
    });
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
