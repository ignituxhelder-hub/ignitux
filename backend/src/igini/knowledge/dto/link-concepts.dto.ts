import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LinkConceptsDto {
  @IsUUID()
  toConceptId: string;

  @IsString()
  @MinLength(1, { message: 'relationType ne peut pas être vide.' })
  @MaxLength(100)
  relationType: string;
}
