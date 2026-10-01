import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: "L'email n'est pas valide." })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password: string;

  /**
   * Jeton renvoyé par le widget Cloudflare Turnstile. Les jetons réels font
   * quelques centaines de caractères ; la limite écarte tôt un corps gonflé
   * sans intérêt, avant qu'il ne parte vers Cloudflare.
   */
  @IsString()
  @IsNotEmpty({ message: 'Vérification anti-robot manquante.' })
  @MaxLength(2048, { message: 'Jeton de vérification invalide.' })
  captchaToken: string;
}
