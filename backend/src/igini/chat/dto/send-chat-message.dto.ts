import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  @MaxLength(4000, { message: 'content ne doit pas dépasser 4000 caractères.' })
  content: string;
}
