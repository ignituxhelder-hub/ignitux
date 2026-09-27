'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AgendaItem, type CrmContact } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// L'input datetime-local attend "AAAA-MM-JJThh:mm", sans le décalage horaire
// que toISOString() ajoute.
function toDatetimeLocal(date: Date): string {
  const decalage = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}

export default function AgendaPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<AgendaItem[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(new Date()));
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [contactId, setContactId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState('');
  const [editLocation, setEditLocation] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([api.listAgenda(token), api.listCrmContacts(token, {})])
      .then(([agendaItems, crmContacts]) => {
        setItems(agendaItems);
        setContacts(crmContacts);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Impossible de charger l'agenda."),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, router]);

  if (!isReady || !token) {
    return null;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !title.trim() || !occurredAt) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.createAgendaEvent(token, {
        title: title.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        location: location.trim() || undefined,
        note: note.trim() || undefined,
        contactId: contactId || undefined,
      });
      setTitle('');
      setOccurredAt(toDatetimeLocal(new Date()));
      setLocation('');
      setNote('');
      setContactId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce rendez-vous.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: AgendaItem & { type: 'evenement' }) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditOccurredAt(toDatetimeLocal(new Date(item.date)));
    setEditLocation(item.location ?? '');
  }

  async function handleUpdate(id: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editTitle.trim()) return;
    setError(null);
    try {
      await api.updateAgendaEvent(token, id, {
        title: editTitle.trim(),
        occurredAt: editOccurredAt ? new Date(editOccurredAt).toISOString() : undefined,
        location: editLocation.trim() || undefined,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de modifier ce rendez-vous.');
    }
  }

  async function handleDelete(item: AgendaItem & { type: 'evenement' }) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteAgendaEvent(token, item.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce rendez-vous.');
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Agenda</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Tes rendez-vous, et les échéances qu&apos;IGINI te rappelle — dans une seule liste,
          triée par date. Une échéance reste une tâche de projet ; seuls les rendez-vous se
          modifient ici.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un rendez-vous</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Titre du rendez-vous"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            aria-label="Date et heure du rendez-vous"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <input
            aria-label="Lieu"
            placeholder="Lieu (facultatif)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <select
            aria-label="Contact lié"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">Aucun contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name}
              </option>
            ))}
          </select>
          <input
            aria-label="Note"
            placeholder="Note (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>À venir</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && items.length === 0 && (
          <p className="muted">Aucun rendez-vous ni échéance pour l&apos;instant.</p>
        )}

        <ul aria-label="Agenda" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`} className="project-item" style={{ marginBottom: '0.5rem' }}>
              {item.type === 'evenement' && editingId === item.id ? (
                <form
                  onSubmit={(e) => void handleUpdate(item.id, e)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input
                    aria-label={`Titre de ${item.title}`}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <input
                    aria-label={`Date de ${item.title}`}
                    type="datetime-local"
                    value={editOccurredAt}
                    onChange={(e) => setEditOccurredAt(e.target.value)}
                  />
                  <input
                    aria-label={`Lieu de ${item.title}`}
                    placeholder="Lieu (facultatif)"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                  />
                  <button className="secondary" type="submit">
                    Enregistrer
                  </button>
                  <button className="secondary" type="button" onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </form>
              ) : (
                <div className="top-bar">
                  <span>
                    <span className="muted">{formatDate(item.date)}</span>{' '}
                    {item.type === 'echeance' && (
                      <span style={{ color: 'var(--danger)' }}>— échéance —</span>
                    )}{' '}
                    <strong>{item.title}</strong>
                    {item.type === 'evenement' && item.location && (
                      <span className="muted"> · {item.location}</span>
                    )}
                  </span>
                  {item.type === 'evenement' && (
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => startEdit(item as AgendaItem & { type: 'evenement' })}
                      >
                        Modifier
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void handleDelete(item as AgendaItem & { type: 'evenement' })}
                      >
                        Supprimer
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
