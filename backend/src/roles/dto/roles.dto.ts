import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import { ROLE_IDS } from '../roles-catalogue.js';

export class SetRolesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Il faut garder au moins un rôle.' })
  // Bornée au catalogue : une liste non bornée laisserait passer une requête
  // absurde avant même que le service ne se prononce.
  @ArrayMaxSize(ROLE_IDS.length)
  @IsString({ each: true })
  roles!: string[];
}

export class SetActiveRoleDto {
  @IsIn(ROLE_IDS, { message: `role doit être l'un de : ${ROLE_IDS.join(', ')}.` })
  role!: string;
}
