import { Equals, IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { CGU_VERSIONS_ACCEPTEES } from '../cgu.js';

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

  /**
   * La case « J'ai lu et j'accepte les conditions d'utilisation et la
   * politique de confidentialité ». Exactement `true` : ni absent, ni
   * `false`, ni la chaîne "true" (la ValidationPipe ne convertit rien).
   */
  @Equals(true, {
    message: "Il faut accepter les conditions d'utilisation et la politique de confidentialité.",
  })
  acceptCgu: true;

  /**
   * La version que la page affichait. Elle doit être celle en vigueur : sinon
   * la personne a accepté un texte qui n'est plus le bon. (La précédente est
   * tolérée le temps du déploiement — voir CGU_VERSIONS_ACCEPTEES — et c'est
   * elle qui est alors enregistrée.)
   */
  @IsIn(CGU_VERSIONS_ACCEPTEES, {
    message:
      "Les conditions d'utilisation ont changé depuis l'ouverture de cette page : recharge-la pour lire et accepter la version en vigueur.",
  })
  cguVersion: string;
}
