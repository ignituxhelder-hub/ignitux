import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { getEnv } from '../config/env.js';
import { parseMailTransport } from '../config/production-preflight.js';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
}

/** Ce qu'il est advenu d'un envoi. Rendu au lieu d'être tu. */
export type MailOutcome = 'sent' | 'logged' | 'failed';

/**
 * ENVOI D'EMAIL.
 *
 * Deux transports, et le choix doit être écrit — voir
 * production-preflight.ts. `smtp` parle à n'importe quel fournisseur (SES,
 * Postmark, Resend, Brevo, un serveur maison) : c'est le plus petit
 * dénominateur commun, et il évite d'enfermer le produit dans une API
 * propriétaire avant que le choix du fournisseur ne soit fait.
 *
 * `log` écrit le message dans le journal du serveur au lieu de l'envoyer.
 * C'est utilisable en développement, et **acceptable en production à une
 * condition** : que ce soit une décision, pas un oubli. D'où l'exigence de
 * l'écrire.
 *
 * ## Ce que cette classe ne fait pas, délibérément
 *
 * Elle **ne relance pas** un envoi échoué, et ne met rien en file. Un email
 * de réinitialisation qui part trois minutes trop tard ne sert plus à rien —
 * la personne a déjà redemandé un lien. Une file d'attente donnerait
 * l'illusion de la robustesse en ajoutant surtout des états à déboguer.
 *
 * Elle **ne masque pas** un échec : l'appelant apprend ce qui s'est passé.
 * Un envoi raté avalé en silence produit exactement la panne qu'on ne peut
 * pas diagnostiquer — quelqu'un dit « je n'ai rien reçu » et rien, nulle
 * part, ne dit pourquoi.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  /** 'smtp' | 'log'. Hors production, l'absence de choix retombe sur 'log'. */
  private get transport(): 'smtp' | 'log' {
    return parseMailTransport(getEnv().MAIL_TRANSPORT) ?? 'log';
  }

  onModuleInit(): void {
    if (this.transport !== 'smtp') {
      this.logger.warn(
        "Transport email « log » : aucun message ne partira réellement. La " +
          'réinitialisation de mot de passe ne fonctionnera pas pour de vraies personnes.',
      );
      return;
    }

    const env = getEnv();
    const port = Number(env.SMTP_PORT ?? '587');
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port,
      // 465 est le port du TLS implicite ; 587 négocie STARTTLS. Se tromper
      // ici donne une connexion qui pend jusqu'au délai d'attente, pas une
      // erreur claire — d'où la déduction plutôt qu'un réglage de plus.
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    this.logger.log(`Transport email SMTP vers ${env.SMTP_HOST}:${port}.`);
  }

  /**
   * Envoie, ou journalise, et dit lequel des deux.
   *
   * Ne lève jamais : un échec d'envoi ne doit pas faire échouer l'inscription
   * qui l'a déclenché. Mais il est journalisé en `error` — visible dans la
   * surveillance — et rendu à l'appelant, qui peut le dire à la personne.
   */
  async send(options: MailOptions): Promise<MailOutcome> {
    if (this.transport !== 'smtp' || this.transporter === null) {
      this.logger.warn(
        `Email NON ENVOYÉ (transport « log ») — À : ${options.to} | Objet : ${options.subject}\n${options.text}`,
      );
      return 'logged';
    }

    try {
      await this.transporter.sendMail({
        from: getEnv().MAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
      });
      return 'sent';
    } catch (error) {
      // L'adresse figure dans le message : sans elle, on sait qu'un envoi a
      // échoué sans savoir pour qui, ce qui rend le diagnostic impossible.
      this.logger.error(
        `Échec d'envoi à ${options.to} (objet : ${options.subject}) — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 'failed';
    }
  }

  /**
   * Le transport répond-il ?
   *
   * Sert à l'endpoint de santé. Vérifier la configuration ne suffit pas : des
   * identifiants syntaxiquement valides mais révoqués passent tous les
   * contrôles de forme et échouent au premier envoi réel.
   */
  async verify(): Promise<{ transport: string; reachable: boolean; detail: string | null }> {
    if (this.transport !== 'smtp' || this.transporter === null) {
      return {
        transport: 'log',
        reachable: false,
        detail: "Aucun email ne part : le transport est « log ».",
      };
    }
    try {
      await this.transporter.verify();
      return { transport: 'smtp', reachable: true, detail: null };
    } catch (error) {
      return {
        transport: 'smtp',
        reachable: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
