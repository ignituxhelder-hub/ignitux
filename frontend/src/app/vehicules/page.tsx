'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type FleetEntries, type FleetVehicle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

const AUCUNE_ENTREE: FleetEntries = { entries: [], totalCostCents: 0, costPerKmCents: null };

export default function VehiculesPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [selected, setSelected] = useState<FleetVehicle | null>(null);
  const [entries, setEntries] = useState<FleetEntries>(AUCUNE_ENTREE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [plate, setPlate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPlate, setEditPlate] = useState('');

  const [entryCost, setEntryCost] = useState('');
  const [entryKm, setEntryKm] = useState('');
  const [entryReason, setEntryReason] = useState('');
  const [entryDate, setEntryDate] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listVehicles(token)
      .then(setVehicles)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger la flotte.'),
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
      await api.createVehicle(token, { label: label.trim(), plate: plate.trim() || undefined });
      setLabel('');
      setPlate('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce véhicule.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(vehicle: FleetVehicle) {
    setEditingId(vehicle.id);
    setEditLabel(vehicle.label);
    setEditPlate(vehicle.plate ?? '');
  }

  async function handleUpdate(id: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editLabel.trim()) return;
    setError(null);
    try {
      await api.updateVehicle(token, id, { label: editLabel.trim(), plate: editPlate.trim() || undefined });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de modifier ce véhicule.');
    }
  }

  async function handleDelete(vehicle: FleetVehicle) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteVehicle(token, vehicle.id);
      if (selected?.id === vehicle.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce véhicule.');
    }
  }

  async function handleSelect(vehicle: FleetVehicle) {
    if (!token) return;
    setError(null);
    setSelected(vehicle);
    try {
      setEntries(await api.listVehicleEntries(token, vehicle.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique.");
    }
  }

  async function handleRecordEntry(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !entryCost.trim()) return;
    const costCents = centimesDepuisEuros(entryCost);
    if (costCents === null || costCents < 0) {
      setError('Le coût doit être un nombre positif.');
      return;
    }
    const odometerKm = entryKm.trim() ? Number(entryKm) : undefined;
    if (odometerKm !== undefined && !Number.isInteger(odometerKm)) {
      setError('Le kilométrage doit être un nombre entier.');
      return;
    }
    setError(null);
    try {
      await api.recordVehicleEntry(token, selected.id, {
        costCents,
        odometerKm,
        reason: entryReason.trim() || undefined,
        occurredOn: entryDate || undefined,
      });
      setEntryCost('');
      setEntryKm('');
      setEntryReason('');
      setEntryDate('');
      setEntries(await api.listVehicleEntries(token, selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce relevé.");
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Véhicules</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Ta flotte, son entretien, et son coût au kilomètre — calculé entre le premier et le
          dernier relevé au compteur, jamais inventé tant qu&apos;il manque un point de mesure.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un véhicule</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Nom du véhicule"
            placeholder="Nom du véhicule"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Plaque"
            placeholder="Plaque (facultatif)"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Flotte</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && vehicles.length === 0 && (
          <p className="muted">Aucun véhicule enregistré pour l&apos;instant.</p>
        )}

        <ul aria-label="Liste des véhicules" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {vehicles.map((vehicle) => (
            <li key={vehicle.id} className="project-item" style={{ marginBottom: '0.5rem' }}>
              {editingId === vehicle.id ? (
                <form
                  onSubmit={(e) => void handleUpdate(vehicle.id, e)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input
                    aria-label={`Nom de ${vehicle.label}`}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <input
                    aria-label={`Plaque de ${vehicle.label}`}
                    placeholder="Plaque (facultatif)"
                    value={editPlate}
                    onChange={(e) => setEditPlate(e.target.value)}
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
                    <strong>{vehicle.label}</strong>{' '}
                    {vehicle.plate && <span className="muted">{vehicle.plate}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="secondary" type="button" onClick={() => void handleSelect(vehicle)}>
                      Entretien
                    </button>
                    <button className="secondary" type="button" onClick={() => startEdit(vehicle)}>
                      Modifier
                    </button>
                    <button className="secondary" type="button" onClick={() => void handleDelete(vehicle)}>
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
            <h2 style={{ margin: 0 }}>Entretien de {selected.label}</h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <p className="muted">
            Dépense totale {euros(entries.totalCostCents)}
            {entries.costPerKmCents !== null && (
              <> · {euros(Math.round(entries.costPerKmCents))} / km</>
            )}
          </p>

          <form onSubmit={handleRecordEntry} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              aria-label="Coût en euros"
              placeholder="Coût (€)"
              value={entryCost}
              onChange={(e) => setEntryCost(e.target.value)}
            />
            <input
              aria-label="Kilométrage au compteur"
              placeholder="Compteur (km, facultatif)"
              value={entryKm}
              onChange={(e) => setEntryKm(e.target.value)}
            />
            <input
              aria-label="Motif de l'entretien"
              placeholder="Motif (facultatif)"
              value={entryReason}
              onChange={(e) => setEntryReason(e.target.value)}
              style={{ flex: '1 1 200px' }}
            />
            <input
              aria-label="Date de l'entretien"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
            <button className="secondary" type="submit">
              Enregistrer
            </button>
          </form>

          {entries.entries.length === 0 ? (
            <p className="muted">Aucun relevé enregistré pour l&apos;instant.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
              {entries.entries.map((entry) => (
                <li key={entry.id} style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">
                    {jour(entry.occurred_on)} — {euros(entry.cost_cents)}
                    {entry.odometer_km !== null && ` · ${entry.odometer_km} km`}
                  </span>
                  {entry.reason && <p style={{ margin: '0.25rem 0 0' }}>{entry.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
