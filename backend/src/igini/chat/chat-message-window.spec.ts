import { toClaudeMessages } from './chat-message-window.js';

describe('toClaudeMessages', () => {
  it('convertit le rôle igini en assistant', () => {
    expect(
      toClaudeMessages([
        { role: 'user', content: 'Salut' },
        { role: 'igini', content: 'Bonjour !' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Salut' },
      { role: 'assistant', content: 'Bonjour !' },
    ]);
  });

  it('fusionne deux messages user consécutifs (tour précédent resté sans réponse)', () => {
    expect(
      toClaudeMessages([
        { role: 'user', content: 'Première question' },
        { role: 'user', content: 'Deuxième question, sans réponse entre les deux' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Première question\nDeuxième question, sans réponse entre les deux' },
    ]);
  });

  it('retire les messages igini en tête, avant le premier message user', () => {
    expect(
      toClaudeMessages([
        { role: 'igini', content: 'Orpheline' },
        { role: 'user', content: 'Salut' },
      ]),
    ).toEqual([{ role: 'user', content: 'Salut' }]);
  });

  it('renvoie un tableau vide pour un historique vide', () => {
    expect(toClaudeMessages([])).toEqual([]);
  });
});
