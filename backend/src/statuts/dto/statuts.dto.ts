import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AssociateInputDto {
  @IsString()
  @MinLength(1, { message: 'fullName ne peut pas être vide.' })
  @MaxLength(200)
  fullName: string;

  // Points de base : 10000 = 100 %. Voir Global Constraints du plan.
  @IsInt()
  @Min(1)
  @Max(10000)
  shareBasisPoints: number;
}

export class GenerateBylawsDto {
  @IsInt()
  @Min(1, { message: 'Le capital doit être strictement positif.' })
  // Plafond de la colonne `Int` (capital_cents) : au-delà, Postgres refuserait
  // l'écriture APRÈS l'appel Claude, payé pour rien. Mieux vaut un 400 tout de suite.
  @Max(2_147_483_647, { message: 'Le capital dépasse le maximum enregistrable (21 474 836,47 €).' })
  capitalCents: number;

  @IsString()
  @MinLength(1, { message: 'headOffice ne peut pas être vide.' })
  @MaxLength(300)
  headOffice: string;

  @IsInt()
  @Min(1)
  @Max(99)
  durationYears: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Il faut au moins un associé.' })
  @ValidateNested({ each: true })
  @Type(() => AssociateInputDto)
  associates: AssociateInputDto[];
}

export class UpdateBylawsContentDto {
  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  content: string;
}
