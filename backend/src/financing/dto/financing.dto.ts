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
import { BUYBACK_CONDITIONS } from '../buyback-progress.js';
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

/**
 * Définition d'une condition de rachat. Le porteur écrit ce que
 * « rentabilité », « autonomie » ou « stabilité » veut dire pour son
 * projet — le modèle économique les nomme sans les chiffrer.
 */
export class SetBuybackObjectiveDto {
  @IsIn(BUYBACK_CONDITIONS, {
    message: `kind doit être l'une de : ${BUYBACK_CONDITIONS.join(', ')}.`,
  })
  kind: string;

  // Une définition vide ne poserait aucune condition tout en ayant l'air
  // d'en poser une : c'est précisément ce qu'il faut empêcher.
  @IsString()
  @MinLength(3, { message: 'Écris ce que cette condition veut dire pour ton projet.' })
  @MaxLength(2000, { message: 'La définition ne doit pas dépasser 2000 caractères.' })
  definition: string;
}

/** Déclaration, par le porteur, qu'une condition est atteinte — ou ne l'est plus. */
export class DeclareBuybackObjectiveDto {
  /** Date à laquelle la condition a été atteinte. `null` pour revenir en arrière. */
  @IsOptional()
  @IsDateString()
  reachedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "La justification ne doit pas dépasser 2000 caractères." })
  evidence?: string;
}
