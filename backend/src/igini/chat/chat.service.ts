import { Injectable } from '@nestjs/common';
import { BAREME } from '../../credits/bareme.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClaudeService } from '../claude/claude.service.js';
import { buildSystemPrompt } from '../claude/igini-identity.js';
import {
  ajouterPropositions,
  ConfirmationsDuTour,
  enCredits,
  estConfirmation,
  lireConfirmations,
  OUTILS_PAYANTS,
  retirerMarqueursConfirmation,
} from './chat-confirmation.js';
import { toClaudeMessages } from './chat-message-window.js';
import { IGINI_TOOL_DEFINITIONS } from './igini-tools.js';
import { IginiToolsService } from './igini-tools.service.js';

/**
 * Combien de messages passés servent de contexte à un nouvel appel — au-delà,
 * le coût par appel grimpe sans ajouter grand-chose à une conversation.
 */
export const CHAT_HISTORY_WINDOW = 20;

const SYSTEM_PROMPT = buildSystemPrompt(`Ici, tu peux à la fois répondre en conversation libre et agir via des
outils : lister les projets de la personne (lister_projets), relire ses souvenirs (rappeler_souvenirs), ou
déclencher l'une des cinq étapes de ta méthode (analyser, construire, financer, developper, transmettre) sur un
projet précis.

Règle stricte : n'appelle un outil générateur (analyser/construire/financer/developper/transmettre) que si la
personne l'a explicitement demandé dans son dernier message, ou a confirmé une proposition que tu viens de lui
faire. Ne le fais jamais de façon spéculative, même si tu penses que ce serait utile.

Chaque étape de ta méthode se paie en crédits, à son prix, débité du compte du propriétaire du projet, en plus de
ce message-ci (${enCredits(BAREME.discuter.credits)}). Les prix : ${OUTILS_PAYANTS.map(
      (nom) => `${nom} : ${enCredits(BAREME[nom].credits)}`,
    ).join(' ; ')}.

Le prix se confirme avant d'être dépensé, et c'est le serveur qui le garantit : quand la personne demande une
étape, appelle l'outil. Ce premier appel ne lance rien et ne débite rien : il te rend « PRIX À CONFIRMER » avec le
prix. Annonce alors ce prix en une phrase et demande-lui de confirmer (un bouton de confirmation s'affiche sous ta
réponse). Au message suivant, si elle a dit oui, rappelle l'outil : il s'exécute. Sans ce oui, ne le rappelle pas.
N'écris jamais toi-même le format [[confirmer: ...]].

Si un outil te renvoie une erreur (crédits insuffisants, garde-fou de sécurité atteint, projet introuvable...),
explique la situation à la personne dans tes mots, sans lui montrer de message technique brut ; pour des crédits
insuffisants, dis-lui combien il en faut et qu'elle peut en recharger depuis « Mes crédits ».

Si tu viens de déclencher un générateur, termine ta réponse par le projet concerné sur sa propre ligne, au
format exact : [[projet: L_IDENTIFIANT_DU_PROJET]]. N'écris jamais ce format dans un autre contexte.

Si un élément de la conversation mérite d'être retenu en mémoire, et seulement si la personne semble d'accord
pour le garder, propose-le en langage naturel puis termine ta réponse par le contenu suggéré sur sa propre
ligne, au format exact : [[souvenir: LE_CONTENU_A_RETENIR]]. Tu ne peux jamais écrire un souvenir toi-même —
seule la personne peut confirmer, en cliquant sur le bouton que ce format fait apparaître.`);

/**
 * CHAT — la conversation orchestrée avec Igini. Un seul fil continu par
 * utilisateur : `sendMessage` persiste le tour de la personne avant
 * d'appeler Claude, pour que le message reste visible dans l'historique
 * même si la réponse échoue (plafond atteint, panne réseau...). Le détail
 * des outils appelés pendant le tour n'est jamais persisté — seule la
 * réponse finale en langage naturel l'est, via `ClaudeService.converseWithTools`.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly iginiTools: IginiToolsService,
  ) {}

  async sendMessage(userId: string, content: string) {
    const previous = await this.prisma.chat_messages.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: CHAT_HISTORY_WINDOW,
    });

    await this.prisma.chat_messages.create({
      data: { user_id: userId, role: 'user', content },
    });

    // `chat_messages.role` est une colonne texte libre côté Prisma (comme
    // `memories.category` ailleurs dans ce schéma) : seul ce service y écrit,
    // toujours 'user' ou 'igini', mais le type généré reste `string`. Ce
    // point est la frontière où la ligne de base rencontre le type étroit
    // qu'exige toClaudeMessages.
    const ordered = [...previous].reverse().map((row) => ({
      role: row.role as 'user' | 'igini',
      content: row.content,
    }));
    const claudeMessages = toClaudeMessages([...ordered, { role: 'user' as const, content }]);

    // Un outil payant ne s'exécute que si CE message dit oui à une proposition
    // du message d'IGINI qui le précède immédiatement (voir chat-confirmation.ts).
    const precedent = previous[0];
    const accordees =
      precedent?.role === 'igini' && estConfirmation(content) ? lireConfirmations(precedent.content) : [];
    const confirmations = new ConfirmationsDuTour(accordees);

    const reply = await this.claude.converseWithTools({
      systemPrompt: SYSTEM_PROMPT,
      messages: claudeMessages,
      usage: { userId, projectId: null, generator: 'discuter' },
      tools: IGINI_TOOL_DEFINITIONS,
      executeTool: (name, input) => this.iginiTools.execute(name, input, { userId, confirmations }),
    });

    // Le marqueur de confirmation n'est jamais celui du modèle : on retire ce
    // qu'il aurait écrit, et le serveur ajoute ceux des prix proposés.
    const texte = ajouterPropositions(retirerMarqueursConfirmation(reply), confirmations.propositions());

    return this.prisma.chat_messages.create({
      data: { user_id: userId, role: 'igini', content: texte },
    });
  }

  async history(userId: string, limit = 50) {
    const messages = await this.prisma.chat_messages.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return messages.reverse();
  }
}
