import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(1, { message: 'message ne peut pas être vide.' })
  @MaxLength(2000, { message: 'message ne doit pas dépasser 2000 caractères.' })
  message: string;
}
