import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FINANCING_SOURCES, TOTAL_BASIS_POINTS } from '../financing-model.js';

export class RecordRoundDto {
  @IsIn(FINANCING_SOURCES, {
    message: `source doit être l'une de : ${FINANCING_SOURCES.join(', ')}.`,
  })
  source: string;

  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  @Min(1, { message: 'Un financement doit porter un montant strictement positif.' })
  amountCents: number;

  /** Date réelle de l'apport, pas celle de la saisie. */
  @IsDateString()
  occurredAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AddHolderDto {
  @IsString()
  @MinLength(1, { message: 'name ne peut pas être vide.' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsBoolean()
  isFounder?: boolean;
}

export class RecordEquityChangeDto {
  /** Part APRÈS le changement, en points de base : 10000 = 100 %. */
  @IsInt({ message: 'shareBasisPoints doit être un entier (points de base).' })
  @Min(0)
  @Max(TOTAL_BASIS_POINTS, { message: 'Une part ne peut pas dépasser 100 %.' })
  shareBasisPoints: number;

  // Le motif est obligatoire : une part qui change sans raison consignée
  // rend l'historique inexploitable le jour où quelqu'un le relit.
  @IsString()
  @MinLength(1, { message: 'Un changement de part doit être motivé.' })
  @MaxLength(500)
  reason: string;

  @IsDateString()
  occurredAt: string;
}

export class RecordDividendDto {
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  @Min(1, { message: 'Un dividende versé porte un montant strictement positif.' })
  amountCents: number;

  @IsDateString()
  occurredAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
