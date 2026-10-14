import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** AAAA-MM : un mois, pas un jour — personne ne se souvient du jour. */
const MOIS = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;
const MOIS_MESSAGE = 'Une date de CV s’écrit en mois et année (AAAA-MM).';

/** Au-delà, ce n'est plus un CV qu'on décrit : c'est un import déguisé. */
export const CV_LIGNES_MAX = 30;

export class ExperienceDto {
  @IsString()
  @MinLength(1, { message: 'Le poste ne peut pas être vide.' })
  @MaxLength(150)
  poste!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  entreprise?: string | null;

  @IsOptional()
  @Matches(MOIS, { message: MOIS_MESSAGE })
  debut?: string | null;

  @IsOptional()
  @Matches(MOIS, { message: MOIS_MESSAGE })
  fin?: string | null;

  @IsOptional()
  @IsBoolean()
  enCours?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class FormationDto {
  @IsString()
  @MinLength(1, { message: 'Le diplôme ne peut pas être vide.' })
  @MaxLength(150)
  diplome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  etablissement?: string | null;

  @IsOptional()
  @IsInt({ message: 'L’année doit être un nombre.' })
  @Min(1940)
  @Max(2100)
  annee?: number | null;
}

/**
 * Le CV entier, remplacé d'un bloc.
 *
 * Remplacer plutôt que modifier ligne par ligne : l'écran édite une liste,
 * et la renvoyer entière évite qu'une suppression, un ajout et un
 * réordonnancement doivent chacun avoir leur route — trois chemins qui
 * finiraient par se contredire.
 */
export class SaveCvDto {
  @IsArray()
  @ArrayMaxSize(CV_LIGNES_MAX)
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experiences!: ExperienceDto[];

  @IsArray()
  @ArrayMaxSize(CV_LIGNES_MAX)
  @ValidateNested({ each: true })
  @Type(() => FormationDto)
  formations!: FormationDto[];
}
