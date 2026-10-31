'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  CreditsProvider,
  erreurIgini,
  MessageErreurIgini,
  PrixIgini,
  useCredits,
  usePrixIgini,
  type ErreurIgini,
} from './prix-igini';

// Global (pas ancré à `$`) : trouvaille de la revue finale, le prompt
// système ne garantit aucun ordre entre les deux marqueurs (chacun dit
// juste « termine ta réponse par… »), et l'ancienne version, ancrée en fin
// de chaîne, ratait le premier marqueur dès que l'ordre n'était pas
// exactement projet-puis-souvenir. Un balayage global retire chaque
// occurrence où qu'elle soit, dans n'importe quel ordre.
const MARQUEUR_RE = /\n?\[\[(projet|souvenir|confirmer):\s*([^\]]+)\]\]/g;

/** Le message qu'envoie le bouton de confirmation : un oui que le serveur reconnaît. */
export const MESSAGE_CONFIRMATION = 'Oui, je confirme.';

/**
 * Le prix d'une étape proposée par IGINI, à confirmer avant qu'elle ne soit
 * lancée (et payée). Le marqueur est écrit par le serveur, jamais par le
 * modèle : `[[confirmer: <outil> <projet> <crédits>]]`. Le bouton envoie une
 * confirmation STRUCTURÉE (outil, projet, crédits) avec « Oui, je confirme. » :
 * c'est elle que le serveur compare au marqueur. Un « oui » tapé ne lance rien.
 */
export function extraireConfirmation(
  contenu: string,
): { outil: string; projetId: string; credits: number } | null {
  const trouve = /\[\[confirmer:\s*(\S+)\s+(\S+)\s+(\d+)\s*\]\]/.exec(contenu);
  if (!trouve) return null;
  return { outil: trouve[1], projetId: trouve[2], credits: Number(trouve[3]) };
}

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

/**
 * Chaque message à IGINI se paie un crédit (barème : « discuter », par
 * message), sur le solde de la personne — le chat n'est attaché à aucun
 * projet. Le solde se lit à l'ouverture du panneau.
 */
export function ChatIgini({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  return (
    <CreditsProvider token={token}>
      <PanneauChat onClose={onClose} />
    </CreditsProvider>
  );
}

function PanneauChat({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const credits = useCredits();
  const prix = usePrixIgini('discuter');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [brouillon, setBrouillon] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<ErreurIgini | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .chatHistory(token)
      .then(setMessages)
      .catch(() => setErreur({ message: 'Impossible de charger la conversation.', voirCredits: false }));
  }, [token]);

  useEffect(() => {
    // jsdom (l'environnement de test) n'implémente pas scrollIntoView du
    // tout — l'appel optionnel évite un TypeError qui n'existe pas dans un
    // vrai navigateur, où la méthode est toujours présente.
    finRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    await envoyerContenu(brouillon.trim());
  }

  async function envoyerContenu(
    contenu: string,
    confirmation?: { outil: string; projectId: string; credits: number },
  ) {
    if (!token || !contenu || envoiEnCours || prix?.insuffisant) return;

    setBrouillon('');
    setErreur(null);
    setEnvoiEnCours(true);
    setMessages((precedents) => [
      ...precedents,
      { id: `temp-${Date.now()}`, role: 'user', content: contenu, created_at: new Date().toISOString() },
    ]);

    try {
      const reponse = await api.sendChatMessage(token, contenu, confirmation);
      setMessages((precedents) => [...precedents, reponse]);
      credits?.actualiser();
    } catch (error) {
      setErreur(erreurIgini(error, 'Impossible de contacter IGINI.'));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="panneau-chat-igini" role="dialog" aria-label="Discuter avec IGINI">
      <header className="panneau-chat-igini__entete">
        <span>IGINI</span>
        <button type="button" onClick={onClose} aria-label="Fermer le chat">
          ✕
        </button>
      </header>

      <div className="panneau-chat-igini__messages">
        {messages.map((message, index) => (
          <MessageIgini
            key={message.id}
            message={message}
            token={token}
            // Seul le dernier message peut être confirmé : le serveur n'accepte
            // un oui qu'à la proposition qui le précède immédiatement.
            onConfirmer={
              index === messages.length - 1 && message.role === 'igini' && !envoiEnCours
                ? (c) => void envoyerContenu(MESSAGE_CONFIRMATION, { outil: c.outil, projectId: c.projetId, credits: c.credits })
                : undefined
            }
          />
        ))}
        <div ref={finRef} />
      </div>

      <MessageErreurIgini erreur={erreur} className="panneau-chat-igini__erreur" />
      {/* Discret : une ligne, en petit, juste au-dessus de la saisie. */}
      <PrixIgini generateur="discuter" className="panneau-chat-igini__prix" />

      <form className="panneau-chat-igini__saisie" onSubmit={envoyer}>
        <input
          type="text"
          value={brouillon}
          onChange={(event) => setBrouillon(event.target.value)}
          placeholder="Écris à IGINI…"
          aria-label="Ton message"
          disabled={envoiEnCours}
        />
        <button
          type="submit"
          className="primary"
          disabled={envoiEnCours || !brouillon.trim() || !!prix?.insuffisant}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}

function MessageIgini({
  message,
  token,
  onConfirmer,
}: {
  message: ChatMessage;
  token: string | null;
  onConfirmer?: (confirmation: { outil: string; projetId: string; credits: number }) => void;
}) {
  const { texte, projetId, souvenirSuggere } = extraireMarqueurs(message.content);
  const confirmation = onConfirmer ? extraireConfirmation(message.content) : null;
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
      {confirmation && (
        <button type="button" className="panneau-chat-igini__action" onClick={() => onConfirmer?.(confirmation)}>
          Confirmer — <span className="credits-montant">{confirmation.credits}</span>{' '}
          {confirmation.credits > 1 ? 'crédits' : 'crédit'}
        </button>
      )}
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
