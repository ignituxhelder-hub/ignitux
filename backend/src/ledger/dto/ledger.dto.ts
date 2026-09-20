import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ACCOUNT_KINDS } from '../chart-of-accounts.js';

export class OpenAccountDto {
  @IsString()
  @MinLength(1, { message: 'Un compte a un code.' })
  @MaxLength(20)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsIn(ACCOUNT_KINDS, {
    message: `kind doit être l'une de : ${ACCOUNT_KINDS.join(', ')}.`,
  })
  kind: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'currency est un code à trois lettres, par exemple EUR.' })
  @MaxLength(3)
  currency?: string;
}

export class EntryLineDto {
  @IsUUID()
  accountId: string;

  // Le sens se dit par la colonne, jamais par un signe : `Min(0)` sur les
  // deux montants rend un débit négatif impossible à envoyer.
  @IsInt({ message: 'debitCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un montant ne peut pas être négatif : utilise l’autre colonne.' })
  debitCents: number;

  @IsInt({ message: 'creditCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un montant ne peut pas être négatif : utilise l’autre colonne.' })
  creditCents: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class RecordEntryDto {
  /** Date de l'opération, pas celle de la saisie. */
  @IsDateString()
  occurredOn: string;

  @IsString()
  @MinLength(1, { message: 'Une écriture porte un libellé : c’est ce qu’on relit six mois après.' })
  @MaxLength(300)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(2, {
    message:
      'Une écriture comptable a au moins deux lignes : ce qui est débité quelque part est crédité ailleurs.',
  })
  @ValidateNested({ each: true })
  @Type(() => EntryLineDto)
  lines: EntryLineDto[];
}
