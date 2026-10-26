import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { OUTILS_PAYANTS } from '../chat-confirmation.js';

/**
 * La confirmation d'un prix, envoyée par le bouton « Confirmer — N crédits »
 * et par lui seul : jamais déduite du texte du message. Le serveur la
 * compare au marqueur du message d'IGINI qui précède (voir
 * chat-confirmation.ts).
 */
export class ConfirmationPrixDto {
  @IsIn(OUTILS_PAYANTS)
  outil: string;

  @IsUUID()
  projectId: string;

  @IsInt()
  @Min(1)
  credits: number;
}

export class SendChatMessageDto {
  @IsString()
  @MinLength(1, { message: 'content ne peut pas être vide.' })
  @MaxLength(4000, { message: 'content ne doit pas dépasser 4000 caractères.' })
  content: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmationPrixDto)
  confirmation?: ConfirmationPrixDto;
}
