import { Injectable, Logger } from '@nestjs/common';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envoi d'email. Aucun fournisseur reel n'est configure pour l'instant (pas
 * de cle SMTP/API dans .env — decision produit, pas encore prise). En
 * attendant, journalise l'email au lieu de l'envoyer, pour que les flux qui
 * en dependent (reinitialisation de mot de passe, verification d'email)
 * restent utilisables plutot que bloques indefiniment sur ce choix.
 *
 * A remplacer par un vrai transport (ex: Resend, AWS SES) le jour ou un
 * fournisseur est choisi : seule cette classe doit changer, les services
 * appelants (PasswordResetService, EmailVerificationService) n'ont pas a
 * etre modifies.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(options: MailOptions): Promise<void> {
    this.logger.warn(
      `Email non envoye (aucun fournisseur configure) — To: ${options.to} | Subject: ${options.subject}\n${options.text}`,
    );
  }
}
