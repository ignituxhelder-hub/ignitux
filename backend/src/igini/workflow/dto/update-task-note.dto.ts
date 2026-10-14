import { IsString, MaxLength } from 'class-validator';

/** Une note vide efface la note : le client envoie toujours le texte entier. */
export class UpdateTaskNoteDto {
  @IsString()
  @MaxLength(1000, { message: 'note ne doit pas dépasser 1000 caractères.' })
  note: string;
}
