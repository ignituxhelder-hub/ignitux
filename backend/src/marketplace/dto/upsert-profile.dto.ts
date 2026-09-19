import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MARKETPLACE_ROLES, type MarketplaceRole } from '../marketplace-role.js';

export class UpsertProfileDto {
  @IsIn(MARKETPLACE_ROLES, { message: `role doit être l'un de : ${MARKETPLACE_ROLES.join(', ')}.` })
  role: MarketplaceRole;

  @IsString()
  @MinLength(1, { message: 'headline ne peut pas être vide.' })
  @MaxLength(120, { message: 'headline ne doit pas dépasser 120 caractères.' })
  headline: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'bio ne doit pas dépasser 2000 caractères.' })
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];
}
