import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email: string;
}
