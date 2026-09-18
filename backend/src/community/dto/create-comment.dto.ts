import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  @MaxLength(1000, { message: 'content ne doit pas dépasser 1000 caractères.' })
  content: string;
}
