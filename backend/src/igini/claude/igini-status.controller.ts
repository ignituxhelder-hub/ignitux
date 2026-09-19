import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClaudeService } from './claude.service.js';

/**
 * Dit à l'interface si les 5 générateurs IGINI sont disponibles.
 *
 * Sans cet endpoint, le frontend ne pourrait l'apprendre qu'en essayant :
 * la personne cliquerait, attendrait, et recevrait une erreur. Un bouton
 * qui échoue ressemble à un produit cassé, même quand le message est juste.
 * Ici l'interface sait avant de proposer, et peut dire « indisponible »
 * plutôt que « échec ».
 *
 * Volontairement sans authentification, comme /health : la réponse ne
 * contient aucune donnée personnelle ni aucun secret — seulement le fait
 * qu'une fonctionnalité est allumée ou éteinte.
 */
@ApiTags('igini')
@Controller('igini')
export class IginiStatusController {
  constructor(private readonly claude: ClaudeService) {}

  @Get('status')
  getStatus() {
    const availability = this.claude.availability();
    return {
      generatorsEnabled: availability.enabled,
      unavailableReason: availability.reason,
    };
  }
}
