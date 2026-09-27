'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type RealEstateMovement, type RealEstateProperty } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

export default function ImmobilierPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [properties, setProperties] = useState<RealEstateProperty[]>([]);
  const [selected, setSelected] = useState<RealEstateProperty | null>(null);
  const [movements, setMovements] = useState<RealEstateMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveDate, setMoveDate] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listProperties(token)
      .then(setProperties)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les biens.'),
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
      await api.createProperty(token, { label: label.trim(), address: address.trim() || undefined });
      setLabel('');
      setAddress('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce bien.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(property: RealEstateProperty) {
    setEditingId(property.id);
    setEditLabel(property.label);
    setEditAddress(property.address ?? '');
  }

  async function handleUpdate(id: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editLabel.trim()) return;
    setError(null);
    try {
      await api.updateProperty(token, id, {
        label: editLabel.trim(),
        address: editAddress.trim() || undefined,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de modifier ce bien.');
    }
  }

  async function handleDelete(property: RealEstateProperty) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteProperty(token, property.id);
      if (selected?.id === property.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce bien.');
    }
  }

  async function handleSelect(property: RealEstateProperty) {
    if (!token) return;
    setError(null);
    setSelected(property);
    try {
      setMovements(await api.listPropertyMovements(token, property.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique.");
    }
  }

  async function handleRecordMovement(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !moveAmount.trim()) return;
    const amountCents = centimesDepuisEuros(moveAmount);
    if (amountCents === null) {
      setError('Le montant doit être un nombre.');
      return;
    }
    setError(null);
    try {
      const updated = await api.recordPropertyMovement(token, selected.id, {
        amountCents,
        reason: moveReason.trim() || undefined,
        occurredOn: moveDate || undefined,
      });
      setSelected(updated);
      setProperties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setMoveAmount('');
      setMoveReason('');
      setMoveDate('');
      setMovements(await api.listPropertyMovements(token, updated.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce mouvement.");
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Immobilier</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Tes biens, et le solde de chacun — loyers perçus moins charges payées. Le solde affiché
          est recalculé à partir de l&apos;historique de ses mouvements, il ne se modifie jamais
          directement.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un bien</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Nom du bien"
            placeholder="Nom du bien"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Adresse"
            placeholder="Adresse (facultatif)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Biens</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && properties.length === 0 && (
          <p className="muted">Aucun bien enregistré pour l&apos;instant.</p>
        )}

        <ul aria-label="Liste des biens" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {properties.map((property) => (
            <li key={property.id} className="project-item" style={{ marginBottom: '0.5rem' }}>
              {editingId === property.id ? (
                <form
                  onSubmit={(e) => void handleUpdate(property.id, e)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input
                    aria-label={`Nom de ${property.label}`}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <input
                    aria-label={`Adresse de ${property.label}`}
                    placeholder="Adresse (facultatif)"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
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
                    <strong>{property.label}</strong>{' '}
                    <span className="muted">
                      {property.address ? `${property.address} · ` : ''}
                      {euros(property.balance_cents)}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="secondary" type="button" onClick={() => void handleSelect(property)}>
                      Historique
                    </button>
                    <button className="secondary" type="button" onClick={() => startEdit(property)}>
                      Modifier
                    </button>
                    <button className="secondary" type="button" onClick={() => void handleDelete(property)}>
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
            <h2 style={{ margin: 0 }}>Mouvements de {selected.label}</h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <form onSubmit={handleRecordMovement} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              aria-label="Montant du mouvement en euros"
              placeholder="+ loyer, - charge (€)"
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
            />
            <input
              aria-label="Motif du mouvement"
              placeholder="Motif (facultatif)"
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
              style={{ flex: '1 1 200px' }}
            />
            <input
              aria-label="Date du mouvement"
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
            />
            <button className="secondary" type="submit">
              Enregistrer
            </button>
          </form>

          {movements.length === 0 ? (
            <p className="muted">Aucun mouvement enregistré pour l&apos;instant.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
              {movements.map((movement) => (
                <li key={movement.id} style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">
                    {jour(movement.occurred_on)} —{' '}
                    {movement.amount_cents > 0 ? '+' : ''}
                    {euros(movement.amount_cents)}
                  </span>
                  {movement.reason && <p style={{ margin: '0.25rem 0 0' }}>{movement.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
