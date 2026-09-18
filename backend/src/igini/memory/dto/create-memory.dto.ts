import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MEMORY_CATEGORIES, type MemoryCategory } from '../memory-category.js';

export class CreateMemoryDto {
  @IsIn(MEMORY_CATEGORIES, {
    message: `category doit être l'une de : ${MEMORY_CATEGORIES.join(', ')}.`,
  })
  category: MemoryCategory;

  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  @MaxLength(2000, { message: 'content ne doit pas dépasser 2000 caractères.' })
  content: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
