'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AdCampaign, type AdCampaignEntries } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

const AUCUNE_ENTREE: AdCampaignEntries = {
  entries: [],
  totalSpentCents: 0,
  totalLeads: 0,
  costPerLeadCents: null,
};

export default function PublicitePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [selected, setSelected] = useState<AdCampaign | null>(null);
  const [entries, setEntries] = useState<AdCampaignEntries>(AUCUNE_ENTREE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [channel, setChannel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editChannel, setEditChannel] = useState('');

  const [entrySpent, setEntrySpent] = useState('');
  const [entryLeads, setEntryLeads] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [entryDate, setEntryDate] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listCampaigns(token)
      .then(setCampaigns)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les campagnes.'),
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
    if (!token || !label.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.createCampaign(token, { label: label.trim(), channel: channel.trim() || undefined });
      setLabel('');
      setChannel('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter cette campagne.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(campaign: AdCampaign) {
    setEditingId(campaign.id);
    setEditLabel(campaign.label);
    setEditChannel(campaign.channel ?? '');
  }

  async function handleUpdate(id: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editLabel.trim()) return;
    setError(null);
    try {
      await api.updateCampaign(token, id, {
        label: editLabel.trim(),
        channel: editChannel.trim() || undefined,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de modifier cette campagne.');
    }
  }

  async function handleDelete(campaign: AdCampaign) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteCampaign(token, campaign.id);
      if (selected?.id === campaign.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer cette campagne.');
    }
  }

  async function handleSelect(campaign: AdCampaign) {
    if (!token) return;
    setError(null);
    setSelected(campaign);
    try {
      setEntries(await api.listCampaignEntries(token, campaign.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique.");
    }
  }

  async function handleRecordEntry(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !entrySpent.trim()) return;
    const spentCents = centimesDepuisEuros(entrySpent);
    if (spentCents === null || spentCents < 0) {
      setError('La dépense doit être un nombre positif.');
      return;
    }
    const leads = entryLeads.trim() ? Number(entryLeads) : undefined;
    if (leads !== undefined && !Number.isInteger(leads)) {
      setError('Le nombre de prospects doit être un nombre entier.');
      return;
    }
    setError(null);
    try {
      await api.recordCampaignEntry(token, selected.id, {
        spentCents,
        leads,
        note: entryNote.trim() || undefined,
        occurredOn: entryDate || undefined,
      });
      setEntrySpent('');
      setEntryLeads('');
      setEntryNote('');
      setEntryDate('');
      setEntries(await api.listCampaignEntries(token, selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer cette entrée.");
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Publicité</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Tes campagnes, ce qu&apos;elles coûtent, et les prospects qu&apos;elles amènent. Le coût
          par prospect se calcule sur l&apos;historique complet, jamais inventé tant qu&apos;aucun
          prospect n&apos;a été compté.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter une campagne</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Nom de la campagne"
            placeholder="Nom de la campagne"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Canal"
            placeholder="Canal (facultatif)"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Campagnes</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && campaigns.length === 0 && (
          <p className="muted">Aucune campagne enregistrée pour l&apos;instant.</p>
        )}

        <ul aria-label="Liste des campagnes" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="project-item" style={{ marginBottom: '0.5rem' }}>
              {editingId === campaign.id ? (
                <form
                  onSubmit={(e) => void handleUpdate(campaign.id, e)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input
                    aria-label={`Nom de ${campaign.label}`}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <input
                    aria-label={`Canal de ${campaign.label}`}
                    placeholder="Canal (facultatif)"
                    value={editChannel}
                    onChange={(e) => setEditChannel(e.target.value)}
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
                    <strong>{campaign.label}</strong>{' '}
                    {campaign.channel && <span className="muted">{campaign.channel}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="secondary" type="button" onClick={() => void handleSelect(campaign)}>
                      Historique
                    </button>
                    <button className="secondary" type="button" onClick={() => startEdit(campaign)}>
                      Modifier
                    </button>
                    <button className="secondary" type="button" onClick={() => void handleDelete(campaign)}>
                      Supprimer
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Historique de {selected.label}</h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <p className="muted">
            Dépense totale {euros(entries.totalSpentCents)} · {entries.totalLeads} prospect
            {entries.totalLeads === 1 ? '' : 's'}
            {entries.costPerLeadCents !== null && (
              <> · {euros(Math.round(entries.costPerLeadCents))} / prospect</>
            )}
          </p>

          <form onSubmit={handleRecordEntry} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              aria-label="Dépense en euros"
              placeholder="Dépense (€)"
              value={entrySpent}
              onChange={(e) => setEntrySpent(e.target.value)}
            />
            <input
              aria-label="Nombre de prospects amenés"
              placeholder="Prospects (facultatif)"
              value={entryLeads}
              onChange={(e) => setEntryLeads(e.target.value)}
            />
            <input
              aria-label="Note"
              placeholder="Note (facultatif)"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              style={{ flex: '1 1 200px' }}
            />
            <input
              aria-label="Date de l'entrée"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
            <button className="secondary" type="submit">
              Enregistrer
            </button>
          </form>

          {entries.entries.length === 0 ? (
            <p className="muted">Aucune entrée enregistrée pour l&apos;instant.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
              {entries.entries.map((entry) => (
                <li key={entry.id} style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">
                    {jour(entry.occurred_on)} — {euros(entry.spent_cents)} · {entry.leads} prospect
                    {entry.leads === 1 ? '' : 's'}
                  </span>
                  {entry.note && <p style={{ margin: '0.25rem 0 0' }}>{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
