/**
 * Transforme l'historique stocké en messages au format attendu par l'API
 * Claude (rôles strictement alternés `user`/`assistant`, en commençant par
 * `user`).
 *
 * Nécessaire parce qu'un tour peut échouer après que le message de
 * l'utilisateur a déjà été persisté (plafond de coût atteint, panne du
 * SDK...) : la ligne reste en base sans réponse d'Igini associée, et
 * l'historique peut alors contenir deux messages `user` consécutifs. L'API
 * Claude refuse une liste de messages qui ne respecte pas l'alternance
 * stricte — les fusionner ici évite de reproduire ce défaut dans chaque
 * appelant.
 */
export interface StoredChatMessage {
  role: 'user' | 'igini';
  content: string;
}

export interface ClaudeChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function toClaudeMessages(rows: readonly StoredChatMessage[]): ClaudeChatMessage[] {
  const merged: ClaudeChatMessage[] = [];

  for (const row of rows) {
    const role = row.role === 'igini' ? 'assistant' : 'user';
    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n${row.content}`;
    } else {
      merged.push({ role, content: row.content });
    }
  }

  // Claude exige que le premier message soit de l'utilisateur : un
  // historique qui commencerait par une réponse ne devrait jamais arriver
  // en pratique, mais le retirer plutôt que planter reste le choix le plus
  // sûr si ça se produisait (donnée ancienne, incident).
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift();
  }

  return merged;
}
