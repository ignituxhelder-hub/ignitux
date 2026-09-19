import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email: string;
}
