import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CRM_CHANNELS, CRM_KINDS, CRM_STAGES } from '../crm-pipeline.js';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1, { message: 'name ne peut pas être vide.' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateContactDto {
  @IsString()
  @MinLength(1, { message: 'firstName ne peut pas être vide.' })
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1, { message: 'lastName ne peut pas être vide.' })
  @MaxLength(100)
  lastName: string;

  // L'e-mail reste facultatif : beaucoup de contacts commencent par un
  // numéro de téléphone griffonné, et exiger une adresse ferait perdre
  // l'information plutôt que de l'améliorer.
  @IsOptional()
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @IsIn(CRM_KINDS, { message: `kind doit être l'un de : ${CRM_KINDS.join(', ')}.` })
  kind?: string;

  @IsOptional()
  @IsIn(CRM_STAGES, { message: `stage doit être l'un de : ${CRM_STAGES.join(', ')}.` })
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateContactDto extends CreateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare lastName: string;
}

export class LogInteractionDto {
  @IsIn(CRM_CHANNELS, { message: `channel doit être l'un de : ${CRM_CHANNELS.join(', ')}.` })
  channel: string;

  @IsString()
  @MinLength(1, { message: 'summary ne peut pas être vide.' })
  @MaxLength(2000)
  summary: string;

  /** Date réelle de l'échange, si elle diffère du moment de la saisie. */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
