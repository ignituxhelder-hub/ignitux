import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** Ce que le client reçoit quand rien de prévu ne s'est produit. */
export interface UnexpectedErrorBody {
  statusCode: number;
  message: string;
  /**
   * L'identifiant à citer pour qu'on retrouve la trace côté serveur.
   *
   * Sans lui, un rapport d'incident ressemble à « ça n'a pas marché hier
   * après-midi » et n'est pas exploitable. Avec lui, une recherche dans le
   * journal donne la pile exacte, la route et le moment.
   */
  reference: string;
}

/**
 * LE DERNIER FILET.
 *
 * Il attrape ce que personne n'a prévu. Deux règles, qui tirent dans des
 * directions opposées et doivent tenir ensemble :
 *
 * 1. **Le client n'apprend rien de l'intérieur.** Un message d'erreur Prisma
 *    nomme des tables et des colonnes ; une pile d'appels nomme des chemins
 *    de fichiers. Ce sont des renseignements offerts à qui cherche par où
 *    entrer, et ils n'aident en rien la personne qui voulait juste
 *    enregistrer son projet.
 *
 * 2. **On perd rien.** Tout ce qui est retiré de la réponse est écrit dans
 *    le journal, rattaché à une référence que la réponse porte. La personne
 *    cite six caractères, on retrouve la pile complète.
 *
 * Les erreurs *prévues* — 401, 403, 404, 422 constitutionnelle, 402 de
 * plafond — passent sans être touchées : leurs messages sont écrits pour
 * être lus, et les remplacer par « erreur interne » supprimerait précisément
 * le travail fait pour qu'un refus s'explique.
 */
@Catch()
export class UnexpectedErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erreur');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = http.getRequest<{ method?: string; url?: string; user?: { id?: string } }>();

    // Une exception HTTP est un refus voulu, pas une panne : elle traverse.
    if (exception instanceof HttpException) {
      const statut = exception.getStatus();
      response.status(statut).json(exception.getResponse());
      // Les 5xx délibérées restent rares et méritent d'être vues.
      if (statut >= 500) {
        this.logger.error(
          `${request.method ?? '?'} ${request.url ?? '?'} → ${statut} : ${exception.message}`,
        );
      }
      return;
    }

    // ── Un corps trop gros n'est pas une panne ──────────────────────────
    //
    // Le parseur JSON refuse au-delà de sa limite, AVANT toute validation,
    // et lève une erreur qui n'est pas une HttpException. Elle tombait donc
    // ici et ressortait en « erreur de notre côté » — ce qui est faux, et
    // faux dans le sens le plus coûteux : la personne croit le produit
    // cassé alors qu'elle peut corriger son envoi en raccourcissant.
    //
    // Trouvé en envoyant 200 000 caractères dans une description : 50 000
    // rendaient un 400 clair, 200 000 un 500 anonyme.
    const type = (exception as { type?: string } | null)?.type;
    if (type === 'entity.too.large' || (exception as { status?: number })?.status === 413) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message:
          'Ce que tu as envoyé est trop volumineux pour être traité. Raccourcis le texte ' +
          "et réessaie — ce n'est pas une panne, et rien n'a été enregistré.",
      });
      return;
    }

    // Court, lisible à l'oral, et suffisant pour retrouver une ligne dans un
    // journal de bêta privée. Un UUID entier serait illisible au téléphone.
    const reference = randomUUID().slice(0, 8);

    this.logger.error(
      `[${reference}] ${request.method ?? '?'} ${request.url ?? '?'}` +
        (request.user?.id ? ` (utilisateur ${request.user.id})` : '') +
        ` — ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const corps: UnexpectedErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        "Une erreur inattendue s'est produite de notre côté. Elle est enregistrée. " +
        `Si tu nous écris, cite la référence ${reference} : elle mène droit à la trace.`,
      reference,
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(corps);
  }
}
