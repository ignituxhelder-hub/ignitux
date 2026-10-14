import { IsBoolean, IsEmail, IsIn, IsOptional } from 'class-validator';
import { ROLES_EQUIPE, type RoleEquipe } from '../droits-equipe.js';

export class InviterMembreDto {
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email!: string;

  /** Observateur si absent : l'accès d'avant les rôles, tout voir sans rien modifier. */
  @IsOptional()
  @IsIn(ROLES_EQUIPE, { message: 'Rôle inconnu : choisis Associé, Salarié, Comptable ou Observateur.' })
  role?: RoleEquipe;
}

export class ChangerRoleDto {
  @IsIn(ROLES_EQUIPE, { message: 'Rôle inconnu : choisis Associé, Salarié, Comptable ou Observateur.' })
  role!: RoleEquipe;
}

/** `PUT /espaces/acces-argent/:memberId` : activer (true) ou couper (false). */
export class ChoisirAccesArgentDto {
  @IsBoolean({ message: 'acces doit valoir true (activer) ou false (couper).' })
  acces!: boolean;
}
