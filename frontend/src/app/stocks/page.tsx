'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  STOCK_UNITS,
  type StockItem,
  type StockMovement,
  type StockUnit,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const UNIT_LABELS: Record<StockUnit, string> = {
  unite: 'Unité',
  kg: 'Kg',
  litre: 'Litre',
  heure: 'Heure',
  autre: 'Autre',
};

function estSousLeSeuil(item: StockItem): boolean {
  return item.alert_below !== null && parseFloat(item.quantity) <= parseFloat(item.alert_below);
}

export default function StocksPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<StockItem[]>([]);
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<StockUnit>('unite');
  const [alertBelow, setAlertBelow] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState<StockUnit>('unite');
  const [editAlertBelow, setEditAlertBelow] = useState('');

  const [moveQuantity, setMoveQuantity] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveDate, setMoveDate] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listStockItems(token)
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les stocks.'),
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
    if (!token || !name.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.createStockItem(token, {
        name: name.trim(),
        unit,
        alertBelow: alertBelow.trim() ? Number(alertBelow) : undefined,
      });
      setName('');
      setUnit('unite');
      setAlertBelow('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter cet article.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: StockItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditUnit(item.unit as StockUnit);
    setEditAlertBelow(item.alert_below ?? '');
  }

  async function handleUpdate(id: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editName.trim()) return;
    setError(null);
    try {
      await api.updateStockItem(token, id, {
        name: editName.trim(),
        unit: editUnit,
        alertBelow: editAlertBelow.trim() ? Number(editAlertBelow) : undefined,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de modifier cet article.");
    }
  }

  async function handleDelete(item: StockItem) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteStockItem(token, item.id);
      if (selected?.id === item.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer cet article.');
    }
  }

  async function handleSelect(item: StockItem) {
    if (!token) return;
    setError(null);
    setSelected(item);
    try {
      setMovements(await api.listStockMovements(token, item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger l'historique.");
    }
  }

  async function handleRecordMovement(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !moveQuantity.trim()) return;
    setError(null);
    try {
      const updated = await api.recordStockMovement(token, selected.id, {
        quantity: Number(moveQuantity),
        reason: moveReason.trim() || undefined,
        occurredOn: moveDate || undefined,
      });
      setSelected(updated);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      setMoveQuantity('');
      setMoveReason('');
      setMoveDate('');
      setMovements(await api.listStockMovements(token, updated.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce mouvement.");
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Stocks</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Ce que tu as en réserve, article par article. La quantité affichée est recalculée à
          partir de l&apos;historique de ses mouvements — elle ne se modifie jamais directement.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un article</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Nom de l'article"
            placeholder="Nom de l'article"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select aria-label="Unité" value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)}>
            {STOCK_UNITS.map((value) => (
              <option key={value} value={value}>
                {UNIT_LABELS[value]}
              </option>
            ))}
          </select>
          <input
            aria-label="Seuil d'alerte"
            placeholder="Seuil d'alerte (facultatif)"
            value={alertBelow}
            onChange={(e) => setAlertBelow(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Articles</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && items.length === 0 && (
          <p className="muted">Aucun article en stock pour l&apos;instant.</p>
        )}

        <ul aria-label="Liste des articles" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item) => {
            const enAlerte = estSousLeSeuil(item);
            return (
              <li
                key={item.id}
                className="project-item"
                style={{
                  cursor: 'default',
                  marginBottom: '0.5rem',
                  ...(enAlerte ? { borderLeft: '2px solid var(--danger)' } : {}),
                }}
              >
                {editingId === item.id ? (
                  <form
                    onSubmit={(e) => void handleUpdate(item.id, e)}
                    style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                  >
                    <input
                      aria-label={`Nom de ${item.name}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <select
                      aria-label={`Unité de ${item.name}`}
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value as StockUnit)}
                    >
                      {STOCK_UNITS.map((value) => (
                        <option key={value} value={value}>
                          {UNIT_LABELS[value]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Seuil d'alerte de ${item.name}`}
                      placeholder="Seuil d'alerte (facultatif)"
                      value={editAlertBelow}
                      onChange={(e) => setEditAlertBelow(e.target.value)}
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
                      <strong>{item.name}</strong>{' '}
                      <span className="muted">
                        {item.quantity} {UNIT_LABELS[item.unit as StockUnit] ?? item.unit}
                      </span>
                      {enAlerte && (
                        <span style={{ color: 'var(--danger)' }}> — sous le seuil d&apos;alerte</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="secondary" type="button" onClick={() => void handleSelect(item)}>
                        Historique
                      </button>
                      <button className="secondary" type="button" onClick={() => startEdit(item)}>
                        Modifier
                      </button>
                      <button className="secondary" type="button" onClick={() => void handleDelete(item)}>
                        Supprimer
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Mouvements de {selected.name}</h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <form onSubmit={handleRecordMovement} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              aria-label="Quantité du mouvement"
              placeholder="+ entrée, - sortie"
              value={moveQuantity}
              onChange={(e) => setMoveQuantity(e.target.value)}
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
                    {new Date(movement.occurred_on).toLocaleDateString('fr-FR')} —{' '}
                    {Number(movement.quantity) > 0 ? '+' : ''}
                    {movement.quantity}
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
