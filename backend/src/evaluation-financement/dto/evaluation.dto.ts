import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SECTIONS_MODIFIABLES, type SectionModifiable } from '../evaluation-model.js';

export class ChangementSectionDto {
  @IsIn(SECTIONS_MODIFIABLES)
  section!: SectionModifiable;

  /** Sa forme dépend de la section : le service la vérifie contre le schéma du rapport. */
  @Allow()
  valeur!: unknown;
}

export class ModifierEvaluationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChangementSectionDto)
  changements!: ChangementSectionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  noteIgnitux?: string | null;
}

export class RefaireEvaluationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  consigne!: string;
}

export class RefuserEvaluationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  motif!: string;
}
