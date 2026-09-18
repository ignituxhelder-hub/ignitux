import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: 'Le titre doit contenir au moins 2 caractères.' })
  @MaxLength(200, { message: 'Le titre ne doit pas dépasser 200 caractères.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'La description ne doit pas dépasser 5000 caractères.' })
  description?: string;
}
