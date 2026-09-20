import { Injectable, Logger } from '@nestjs/common';
import { getEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CheckResult {
  /** 'ok' | 'degrade' | 'panne' — trois états, pas deux. */
  etat: 'ok' | 'degrade' | 'panne';
  detail: string;
}

export interface Readiness {
  /** Le pire des états ci-dessous. */
  etat: 'ok' | 'degrade' | 'panne';
  verifications: Record<string, CheckResult>;
}

/**
 * EST-CE QUE CE SERVEUR PEUT SERVIR DE VRAIES PERSONNES, MAINTENANT ?
 *
 * Distinct de `/health`, qui répond « le process est vivant » et sert à un
 * répartiteur de charge. Celui-ci répond « et il est en état de travailler »,
 * ce qui n'est pas la même question : un serveur parfaitement vivant branché
 * sur une base incomplète répond 200 à `/health` et perd la première
 * écriture d'un module récent.
 *
 * Trois états et non deux. « Dégradé » couvre ce qui fonctionne mais
 * amputé — l'email en mode journal, l'IA éteinte : le produit tourne, une
 * partie ne répond pas, et confondre cela avec une panne ferait redémarrer
 * un serveur qui va bien.
 *
 * ## La dérive de schéma
 *
 * La vérification la plus importante est la moins spectaculaire. Une base de
 * production en retard de dix tables laisse l'application **démarrer
 * normalement** ; elle échoue à la première écriture dans un module récent,
 * c'est-à-dire des jours plus tard, chez quelqu'un, sur une action qu'il ne
 * refera pas. Le démarrage réussi donne une fausse confiance — c'est
 * exactement ce que cette sonde retire.
 *
 * La liste attendue est **dérivée du client Prisma lui-même**, pas recopiée :
 * une liste écrite à la main finirait par diverger du schéma, et c'est alors
 * la sonde qui mentirait.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Les tables que le code s'attend à trouver, lues sur le client généré. */
  private expectedTables(): string[] {
    const client = this.prisma as unknown as Record<string, { findMany?: unknown }>;
    return Object.keys(client).filter(
      (cle) =>
        !cle.startsWith('$') &&
        !cle.startsWith('_') &&
        typeof client[cle]?.findMany === 'function',
    );
  }

  async check(): Promise<Readiness> {
    const verifications: Record<string, CheckResult> = {
      base: await this.verifierBase(),
      schema: await this.verifierSchema(),
      email: await this.verifierEmail(),
      ia: this.verifierIa(),
    };

    const etats = Object.values(verifications).map((v) => v.etat);
    const etat = etats.includes('panne') ? 'panne' : etats.includes('degrade') ? 'degrade' : 'ok';

    return { etat, verifications };
  }

  private async verifierBase(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { etat: 'ok', detail: 'La base répond.' };
    } catch (error) {
      return {
        etat: 'panne',
        detail: `Base injoignable — ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async verifierSchema(): Promise<CheckResult> {
    const attendues = this.expectedTables();
    try {
      const lignes = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      const presentes = new Set(lignes.map((l) => l.table_name));
      const manquantes = attendues.filter((t) => !presentes.has(t));

      if (manquantes.length === 0) {
        return { etat: 'ok', detail: `Les ${attendues.length} tables du schéma sont présentes.` };
      }

      // « Panne » et non « dégradé » : le serveur répond, mais toute écriture
      // dans ces modules échouera. Mieux vaut ne pas le laisser prendre de
      // trafic que de perdre le travail de quelqu'un.
      const detail =
        `${manquantes.length} table(s) manquent en base : ${manquantes.join(', ')}. ` +
        "L'application démarre quand même et échouera à la première écriture dans ces " +
        'modules. Lancer `prisma db push` sur cette base.';
      this.logger.error(detail);
      return { etat: 'panne', detail };
    } catch (error) {
      return {
        etat: 'panne',
        detail: `Schéma invérifiable — ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async verifierEmail(): Promise<CheckResult> {
    const resultat = await this.mail.verify();
    if (resultat.reachable) {
      return { etat: 'ok', detail: 'Le transport SMTP répond.' };
    }
    if (resultat.transport === 'log') {
      return {
        etat: 'degrade',
        detail:
          "Transport « log » : aucun email ne part. La réinitialisation de mot de passe " +
          'ne fonctionne pas — une personne qui oublie son mot de passe reste dehors.',
      };
    }
    return {
      etat: 'panne',
      detail: `SMTP configuré mais injoignable — ${resultat.detail ?? 'raison inconnue'}`,
    };
  }

  private verifierIa(): CheckResult {
    const env = getEnv();
    if (env.IGINI_AI_ENABLED === 'false') {
      return {
        etat: 'degrade',
        detail: "Générateurs éteints volontairement. Rien n'est cassé.",
      };
    }
    if (!env.ANTHROPIC_API_KEY) {
      return {
        etat: 'degrade',
        detail: "Générateurs allumés mais aucune clé : ils refuseront chaque appel.",
      };
    }
    return { etat: 'ok', detail: 'Générateurs actifs.' };
  }
}
