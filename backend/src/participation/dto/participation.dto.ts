import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TOTAL_BASIS_POINTS } from '../participation-model.js';

/**
 * Création d'un accord, côté IGNITUX. Toutes les valeurs chiffrées sont
 * optionnelles : absentes, le service applique les valeurs par défaut du
 * modèle actuel, qu'il recopie dans l'accord. Aucune n'est imposée ici.
 */
export class CreateAgreementDto {
  @IsString()
  @MinLength(1, { message: 'founderName ne peut pas être vide.' })
  @MaxLength(200)
  founderName: string;

  @IsDateString()
  effectiveOn: string;

  @IsOptional()
  @IsInt({ message: 'founderBasisPoints doit être un entier (points de base).' })
  @Min(0)
  @Max(TOTAL_BASIS_POINTS)
  founderBasisPoints?: number;

  @IsOptional()
  @IsInt({ message: 'ignituxBasisPoints doit être un entier (points de base).' })
  @Min(0)
  @Max(TOTAL_BASIS_POINTS)
  ignituxBasisPoints?: number;

  @IsOptional()
  @IsInt({ message: 'dividendRightBasisPoints doit être un entier (points de base).' })
  @Min(0)
  @Max(TOTAL_BASIS_POINTS)
  dividendRightBasisPoints?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ecosystemOffre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contractReference?: string;
}

/**
 * Un palier. Aucune date d'échéance, aucune durée : un palier n'est jamais
 * déclenché par le temps.
 */
export class AddMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  /** La part d'IGNITUX visée APRÈS le palier, en points de base. */
  @IsInt({ message: 'targetIgnituxBasisPoints doit être un entier (points de base).' })
  @Min(0)
  @Max(TOTAL_BASIS_POINTS)
  targetIgnituxBasisPoints: number;

  /** Les conditions du palier, écrites pour ce projet. Absentes : « à définir ». */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  conditions?: string[];
}

export class ValidateMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ExecuteMilestoneDto {
  /** La date effective du changement de capital, choisie, jamais calculée. */
  @IsDateString()
  effectiveOn: string;
}

export class RecordDistributedDividendDto {
  @IsInt({ message: 'distributedCents doit être un entier (centimes).' })
  @Min(1, { message: 'Un dividende distribué porte un montant strictement positif.' })
  distributedCents: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SettleDividendRightDto {
  @IsDateString()
  settledOn: string;
}
