import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReadinessService } from './readiness.service.js';

interface ReponseHttp {
  status: (code: number) => { json: (corps: unknown) => void };
}

/**
 * `/ready` — est-ce que ce serveur peut travailler ?
 *
 * Volontairement **public**, comme `/health` : une sonde de surveillance ne
 * porte pas de jeton, et la protéger la rendrait inutilisable par
 * l'outillage qui doit justement alerter quand plus rien ne répond.
 *
 * Ce qu'elle expose est donc choisi pour être publiable : des états et des
 * causes en clair, jamais une chaîne de connexion, un identifiant ni un
 * secret. Le détail d'une panne SMTP peut nommer un code d'erreur du
 * serveur distant — pas les identifiants employés.
 *
 * Le code HTTP suit l'état, pour qu'un superviseur n'ait pas à lire le
 * corps : 200 quand tout va, 200 en dégradé — le produit tourne —, et 503
 * en panne, qui retire le serveur de la rotation d'un répartiteur de charge.
 */
@ApiTags('app')
@Controller()
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: false }) res: ReponseHttp): Promise<void> {
    const resultat = await this.readiness.check();
    const code = resultat.etat === 'panne' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(code).json(resultat);
  }
}
