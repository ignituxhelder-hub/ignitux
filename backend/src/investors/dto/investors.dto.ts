import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { INVESTOR_KINDS } from '../investors.service.js';

export class RegisterInvestorDto {
  @IsString()
  @MinLength(1, { message: 'Un investisseur a un nom.' })
  @MaxLength(200)
  displayName: string;

  @IsOptional()
  @IsIn(INVESTOR_KINDS, { message: `kind doit être l'un de : ${INVESTOR_KINDS.join(', ')}.` })
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class OpenFinancingDto {
  @IsUUID()
  projectId: string;

  @IsDateString()
  openedOn: string;

  @IsOptional()
  @IsInt({ message: 'targetCents doit être un entier (centimes).' })
  @Min(1, { message: 'Une cible de levée est strictement positive.' })
  targetCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RecordParticipationDto {
  @IsUUID()
  investorId: string;

  @IsInt({ message: 'investedCents doit être un entier (centimes).' })
  @Min(1, { message: 'Un investissement porte un montant strictement positif.' })
  investedCents: number;

  /** Date réelle de l'apport, pas celle de la saisie. */
  @IsDateString()
  occurredOn: string;

  /**
   * La part accordée au moment de cet apport. Fait historique : la part
   * d'aujourd'hui se lit dans la table de capitalisation, seule autorité sur
   * le capital.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000, { message: 'Une part ne peut pas dépasser 100 %.' })
  shareBasisPointsGranted?: number;

  @IsOptional()
  @IsUUID()
  equityHolderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DistributionDto {
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  @Min(1, { message: 'Un versement porte un montant strictement positif.' })
  amountCents: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DividendDto extends DistributionDto {
  /**
   * Obligatoire, et non défaut à `true` : tous les projets financés ne sont
   * pas entrés au capital selon le modèle 51/49. Prélever 5 % par défaut
   * reviendrait à décider à la place du porteur.
   */
  @IsBoolean({ message: 'applyPerpetualShare doit être dit explicitement : true ou false.' })
  applyPerpetualShare: boolean;
}

export class CorrectMovementDto {
  /** Signé : ce qu'il faut ajouter au mouvement d'origine pour le rectifier. */
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  amountCents: number;

  @IsDateString()
  occurredOn: string;

  // Le motif est obligatoire : une correction sans raison consignée est une
  // réécriture déguisée, et six mois plus tard personne ne saura pourquoi le
  // montant a changé.
  @IsString()
  @MinLength(1, { message: 'Une correction doit dire pourquoi.' })
  @MaxLength(1000)
  note: string;
}
