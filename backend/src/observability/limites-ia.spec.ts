import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants.js';
import { EquipeController } from '../equipe/equipe.controller.js';
import { EvaluationController } from '../evaluation-financement/evaluation.controller.js';
import { ChatController } from '../igini/chat/chat.controller.js';
import { ExecutionController } from '../igini/execution/execution.controller.js';

/**
 * Les routes qui coûtent un appel IA payé par le propriétaire (ou un email)
 * ont leur propre limite. La limite globale (120/min) ne suffit pas : un
 * associé, ou une boucle dans un onglet, viderait le quota du mois en minutes.
 */
function limite(handler: object): { limit: number; ttl: number } {
  return {
    limit: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler),
    ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, handler),
  };
}

describe('limites propres aux routes coûteuses', () => {
  it.each([
    ['exécuter une tâche', ExecutionController.prototype.runTask, 5],
    ['exécuter une démarche de conformité', ExecutionController.prototype.runCompliance, 5],
    ['demander une évaluation', EvaluationController.prototype.demander, 5],
    ['inviter dans l’équipe (email)', EquipeController.prototype.inviter, 5],
    ['écrire à IGINI dans le chat', ChatController.prototype.send, 20],
  ])('%s : %s par minute', (_nom, handler, attendu) => {
    expect(limite(handler)).toEqual({ limit: attendu, ttl: 60_000 });
  });
});
