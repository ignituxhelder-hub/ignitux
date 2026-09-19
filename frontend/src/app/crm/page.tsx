'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type CrmChannel,
  type CrmContact,
  type CrmKind,
  type CrmPipeline,
  type CrmStage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const STAGE_LABELS: Record<CrmStage, string> = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  qualifie: 'Qualifié',
  proposition: 'Proposition envoyée',
  gagne: 'Gagné',
  perdu: 'Perdu',
};

const KIND_LABELS: Record<CrmKind, string> = {
  prospect: 'Prospect',
  client: 'Client',
  partenaire: 'Partenaire',
  autre: 'Autre',
};

const CHANNEL_LABELS: Record<CrmChannel, string> = {
  appel: 'Appel',
  email: 'E-mail',
  rendez_vous: 'Rendez-vous',
  note: 'Note',
};

const STAGES = Object.keys(STAGE_LABELS) as CrmStage[];

export default function CrmPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [selected, setSelected] = useState<CrmContact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | ''>('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<CrmKind>('prospect');
  const [isSaving, setIsSaving] = useState(false);

  const [channel, setChannel] = useState<CrmChannel>('appel');
  const [summary, setSummary] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      api.listCrmContacts(token, {
        query: appliedQuery || undefined,
        stage: stageFilter || undefined,
      }),
      api.getCrmPipeline(token),
    ])
      .then(([contactList, pipelineSummary]) => {
        setContacts(contactList);
        setPipeline(pipelineSummary);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger le CRM.'),
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
  }, [isReady, token, router, appliedQuery, stageFilter]);

  if (!isReady || !token) {
    return null;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !firstName.trim() || !lastName.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.createCrmContact(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        kind,
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce contact.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStageChange(contact: CrmContact, stage: CrmStage) {
    if (!token) return;
    setError(null);
    try {
      await api.updateCrmContact(token, contact.id, { stage });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de changer l'étape.");
    }
  }

  async function handleSelect(contact: CrmContact) {
    if (!token) return;
    try {
      setSelected(await api.getCrmContact(token, contact.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger ce contact.');
    }
  }

  async function handleLogInteraction(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !summary.trim()) return;
    setError(null);
    try {
      await api.logCrmInteraction(token, selected.id, channel, summary.trim());
      setSummary('');
      setSelected(await api.getCrmContact(token, selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer cet échange.");
    }
  }

  async function handleDelete(contact: CrmContact) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteCrmContact(token, contact.id);
      if (selected?.id === contact.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce contact.');
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Relations</h1>
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Ton carnet commercial : prospects, clients, partenaires, et l&apos;historique de ce que
          tu leur as dit. Il est strictement personnel — un collaborateur d&apos;un de tes projets
          n&apos;y a pas accès.
        </p>
        {pipeline && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {pipeline.stages.map((entry) => (
              <div key={entry.stage}>
                <strong>{entry.count}</strong> <span className="muted">{entry.label}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          Ce sont des comptages, pas des prévisions : Ignitux n&apos;affiche aucun chiffre
          d&apos;affaires prévisionnel, faute d&apos;historique de conversion réel sur lequel
          l&apos;appuyer.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un contact</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Prénom"
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            aria-label="Nom"
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            aria-label="Adresse e-mail"
            placeholder="E-mail (facultatif)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Type de contact"
            value={kind}
            onChange={(e) => setKind(e.target.value as CrmKind)}
          >
            {(Object.keys(KIND_LABELS) as CrmKind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="top-bar" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Contacts</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query.trim());
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        >
          <input
            aria-label="Rechercher un contact"
            placeholder="Rechercher (nom, prénom, e-mail)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filtrer par étape"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as CrmStage | '')}
          >
            <option value="">Toutes les étapes</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          <button className="secondary" type="submit">
            Rechercher
          </button>
        </form>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && contacts.length === 0 && (
          <p className="muted">Aucun contact ne correspond.</p>
        )}

        <ul aria-label="Liste des contacts" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="project-item"
              style={{ cursor: 'default', marginBottom: '0.5rem' }}
            >
              <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                <strong>
                  {contact.first_name} {contact.last_name}
                </strong>
                <span className="muted">{KIND_LABELS[contact.kind]}</span>
              </div>
              {contact.email && <p className="muted" style={{ margin: 0 }}>{contact.email}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  aria-label={`Étape de ${contact.first_name} ${contact.last_name}`}
                  value={contact.stage}
                  onChange={(e) => void handleStageChange(contact, e.target.value as CrmStage)}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
                <button className="secondary" type="button" onClick={() => void handleSelect(contact)}>
                  Historique
                </button>
                <button className="secondary" type="button" onClick={() => void handleDelete(contact)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>
              Échanges avec {selected.first_name} {selected.last_name}
            </h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <form onSubmit={handleLogInteraction} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              aria-label="Canal de l'échange"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CrmChannel)}
            >
              {(Object.keys(CHANNEL_LABELS) as CrmChannel[]).map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
            <input
              aria-label="Résumé de l'échange"
              placeholder="Ce qui s'est dit"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ flex: '1 1 240px' }}
            />
            <button className="secondary" type="submit">
              Enregistrer
            </button>
          </form>

          {(selected.interactions ?? []).length === 0 ? (
            <p className="muted">Aucun échange enregistré pour l&apos;instant.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
              {(selected.interactions ?? []).map((interaction) => (
                <li key={interaction.id} style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">
                    {new Date(interaction.occurred_at).toLocaleString('fr-FR')} —{' '}
                    {CHANNEL_LABELS[interaction.channel]}
                  </span>
                  <p style={{ margin: '0.25rem 0 0' }}>{interaction.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
