import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ACTION_TYPES, CONDITION_TYPES } from '../workflow-conditions.js';

export class WorkflowStepDto {
  @IsString()
  @MinLength(1, { message: 'title ne peut pas être vide.' })
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(CONDITION_TYPES, {
    message: `conditionType doit être l'un de : ${CONDITION_TYPES.join(', ')}.`,
  })
  conditionType: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  conditionValue?: string;

  @IsIn(ACTION_TYPES, { message: `actionType doit être l'un de : ${ACTION_TYPES.join(', ')}.` })
  actionType: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  actionValue?: string;
}

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1, { message: 'name ne peut pas être vide.' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Un processus doit comporter au moins une étape.' })
  // Plafond volontaire : au-delà, ce n'est plus un processus qu'on suit,
  // c'est un formulaire que personne ne lit.
  @ArrayMaxSize(20, { message: 'Un processus ne peut pas dépasser 20 étapes.' })
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

export class CreateWorkflowFromTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug: string;
}
