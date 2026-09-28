'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function ChatIgini({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [brouillon, setBrouillon] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .chatHistory(token)
      .then(setMessages)
      .catch(() => setErreur('Impossible de charger la conversation.'));
  }, [token]);

  useEffect(() => {
    // jsdom (l'environnement de test) n'implémente pas scrollIntoView du
    // tout — l'appel optionnel évite un TypeError qui n'existe pas dans un
    // vrai navigateur, où la méthode est toujours présente.
    finRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    const contenu = brouillon.trim();
    if (!token || !contenu || envoiEnCours) return;

    setBrouillon('');
    setErreur(null);
    setEnvoiEnCours(true);
    setMessages((precedents) => [
      ...precedents,
      { id: `temp-${Date.now()}`, role: 'user', content: contenu, created_at: new Date().toISOString() },
    ]);

    try {
      const reponse = await api.sendChatMessage(token, contenu);
      setMessages((precedents) => [...precedents, reponse]);
    } catch (error) {
      setErreur(error instanceof ApiError ? error.message : 'Impossible de contacter Igini.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="panneau-chat-igini" role="dialog" aria-label="Discuter avec Igini">
      <header className="panneau-chat-igini__entete">
        <span>Igini</span>
        <button type="button" onClick={onClose} aria-label="Fermer le chat">
          ✕
        </button>
      </header>

      <div className="panneau-chat-igini__messages">
        {messages.map((message) => (
          <p
            key={message.id}
            className={`panneau-chat-igini__message panneau-chat-igini__message--${message.role}`}
          >
            {message.content}
          </p>
        ))}
        <div ref={finRef} />
      </div>

      {erreur && <p className="panneau-chat-igini__erreur">{erreur}</p>}

      <form className="panneau-chat-igini__saisie" onSubmit={envoyer}>
        <input
          type="text"
          value={brouillon}
          onChange={(event) => setBrouillon(event.target.value)}
          placeholder="Écris à Igini…"
          aria-label="Ton message"
          disabled={envoiEnCours}
        />
        <button type="submit" className="primary" disabled={envoiEnCours || !brouillon.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
