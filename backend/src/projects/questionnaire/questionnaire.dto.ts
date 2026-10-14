import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SaveQuestionnaireDto {
  /**
   * Les réponses à enregistrer, par identifiant du catalogue.
   *
   * Objet libre plutôt qu'une classe par question, pour la même raison que
   * le profil : le catalogue est la seule source, et c'est lui qui valide
   * (voir `fusionnerReponses`).
   */
  @IsObject()
  reponses!: Record<string, unknown>;

  /** La personne arrive au bout du parcours, ou le déclare fini. */
  @IsOptional()
  @IsBoolean()
  termine?: boolean;
}

export class ReponseIginiDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reponse?: string | null;
}

export class RepondreQuestionsIginiDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReponseIginiDto)
  reponses!: ReponseIginiDto[];
}
