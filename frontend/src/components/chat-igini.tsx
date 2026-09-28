'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Global (pas ancré à `$`) : trouvaille de la revue finale, le prompt
// système ne garantit aucun ordre entre les deux marqueurs (chacun dit
// juste « termine ta réponse par… »), et l'ancienne version, ancrée en fin
// de chaîne, ratait le premier marqueur dès que l'ordre n'était pas
// exactement projet-puis-souvenir. Un balayage global retire chaque
// occurrence où qu'elle soit, dans n'importe quel ordre.
const MARQUEUR_RE = /\n?\[\[(projet|souvenir):\s*([^\]]+)\]\]/g;

export function extraireMarqueurs(contenu: string): {
  texte: string;
  projetId: string | null;
  souvenirSuggere: string | null;
} {
  let projetId: string | null = null;
  let souvenirSuggere: string | null = null;

  const texte = contenu
    .replace(MARQUEUR_RE, (_correspondance, type: string, valeur: string) => {
      // Si le modèle répète un marqueur par erreur, on garde le premier
      // rencontré — le prompt système dit explicitement « jamais plus
      // d'une fois par réponse », un second serait une anomalie à ignorer
      // plutôt qu'à laisser écraser le premier.
      if (type === 'projet' && projetId === null) projetId = valeur.trim();
      if (type === 'souvenir' && souvenirSuggere === null) souvenirSuggere = valeur.trim();
      return '';
    })
    .trim();

  return { texte, projetId, souvenirSuggere };
}

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
          <MessageIgini key={message.id} message={message} token={token} />
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

function MessageIgini({ message, token }: { message: ChatMessage; token: string | null }) {
  const { texte, projetId, souvenirSuggere } = extraireMarqueurs(message.content);
  const [souvenirEnregistre, setSouvenirEnregistre] = useState(false);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);

  async function enregistrerSouvenir() {
    if (!token || !souvenirSuggere || enregistrementEnCours) return;
    setEnregistrementEnCours(true);
    try {
      await api.createMemory(token, undefined, 'fact', souvenirSuggere);
      setSouvenirEnregistre(true);
    } finally {
      setEnregistrementEnCours(false);
    }
  }

  return (
    <div className={`panneau-chat-igini__message panneau-chat-igini__message--${message.role}`}>
      <p style={{ margin: 0 }}>{texte}</p>
      {projetId && (
        <Link href={`/projects/${projetId}`} className="panneau-chat-igini__action">
          Voir le projet →
        </Link>
      )}
      {souvenirSuggere && !souvenirEnregistre && (
        <button
          type="button"
          className="panneau-chat-igini__action"
          onClick={enregistrerSouvenir}
          disabled={enregistrementEnCours}
        >
          Enregistrer ce souvenir
        </button>
      )}
      {souvenirEnregistre && <p className="panneau-chat-igini__confirmation">Souvenir enregistré.</p>}
    </div>
  );
}
