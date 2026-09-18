import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateConceptDto {
  @IsString()
  @MinLength(1, { message: 'name ne peut pas être vide.' })
  @MaxLength(200, { message: 'name ne doit pas dépasser 200 caractères.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'description ne doit pas dépasser 2000 caractères.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
