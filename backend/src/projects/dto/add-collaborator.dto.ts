import { IsEmail } from 'class-validator';

export class AddCollaboratorDto {
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email: string;
}
