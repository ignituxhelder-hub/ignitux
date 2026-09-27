'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type CashRegisterEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CaissePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [vat, setVat] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    if (!token) return;
    setIsLoading(true);
    api
      .listCaisseJournees(token)
      .then(setEntries)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger les relevés.'),
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !occurredOn) return;

    const cashCents = centimesDepuisEuros(cash || '0');
    const cardCents = centimesDepuisEuros(card || '0');
    const vatCents = centimesDepuisEuros(vat || '0');
    if (cashCents === null || cardCents === null || vatCents === null) {
      setError('Les montants doivent être des nombres.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await api.recordCaisseJournee(token, {
        occurredOn,
        cashCents,
        cardCents,
        vatCents,
        note: note.trim() || undefined,
      });
      setCash('');
      setCard('');
      setVat('');
      setNote('');
      setOccurredOn(todayIso());
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce relevé.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Caisse</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Le relevé se saisit à la main, depuis ta caisse certifiée — Ignitux n&apos;encaisse rien
          lui-même et ne remplace aucune caisse certifiée. Chaque relevé rejoint ta comptabilité
          automatiquement, en une écriture équilibrée.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Enregistrer le relevé du jour</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Date du relevé"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
          <input
            aria-label="Total espèces en euros"
            placeholder="Espèces (€)"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
          <input
            aria-label="Total carte en euros"
            placeholder="Carte (€)"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          />
          <input
            aria-label="TVA collectée en euros"
            placeholder="TVA collectée (€)"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
          <input
            aria-label="Note"
            placeholder="Note (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Relevés déjà saisis</h2>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && entries.length === 0 && (
          <p className="muted">Aucun relevé enregistré pour l&apos;instant.</p>
        )}

        <ul aria-label="Relevés de caisse" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((entry) => (
            <li key={entry.id} className="project-item" style={{ marginBottom: '0.5rem' }}>
              <div className="top-bar">
                <span>
                  <strong>{jour(entry.occurred_on)}</strong>{' '}
                  <span className="muted">
                    Espèces {euros(entry.cash_cents)} · Carte {euros(entry.card_cents)} · TVA{' '}
                    {euros(entry.vat_cents)}
                  </span>
                  {entry.note && <p style={{ margin: '0.25rem 0 0' }}>{entry.note}</p>}
                </span>
                {entry.ledger_entry_id && (
                  <Link href="/comptabilite" className="secondary">
                    Voir l&apos;écriture
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
