import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendChatMessageDto } from './send-chat-message.dto.js';

const PROJET = '11111111-1111-4111-8111-111111111111';

async function erreurs(corps: Record<string, unknown>) {
  return validate(plainToInstance(SendChatMessageDto, corps), { whitelist: true, forbidNonWhitelisted: true });
}

/**
 * La confirmation d'un prix n'est jamais du texte : c'est ce champ, envoyé
 * par le bouton « Confirmer — N crédits ». Sa forme est vérifiée avant même
 * d'être comparée au marqueur du serveur.
 */
describe('SendChatMessageDto — la confirmation structurée', () => {
  it('accepte un message sans confirmation', async () => {
    expect(await erreurs({ content: 'Salut' })).toHaveLength(0);
  });

  it('accepte la confirmation du bouton : outil payant, projet, crédits', async () => {
    expect(
      await erreurs({ content: 'Oui, je confirme.', confirmation: { outil: 'analyser', projectId: PROJET, credits: 4 } }),
    ).toHaveLength(0);
  });

  it.each([
    ['un outil gratuit', { outil: 'lister_projets', projectId: PROJET, credits: 1 }],
    ['un outil inconnu', { outil: 'supprimer_tout', projectId: PROJET, credits: 1 }],
    ['un projet qui n’est pas un identifiant', { outil: 'analyser', projectId: 'p1', credits: 4 }],
    ['des crédits non entiers', { outil: 'analyser', projectId: PROJET, credits: 4.5 }],
    ['des crédits négatifs', { outil: 'analyser', projectId: PROJET, credits: -4 }],
    ['un champ en trop', { outil: 'analyser', projectId: PROJET, credits: 4, executer: true }],
  ])('refuse %s', async (_cas, confirmation) => {
    expect(await erreurs({ content: 'Oui, je confirme.', confirmation })).not.toHaveLength(0);
  });
});
