'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type BillingDocument,
  type BillingStatus,
  type BillingType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TYPE_LABELS: Record<BillingType, string> = {
  devis: 'Devis',
  facture: 'Facture',
  avoir: 'Avoir',
};

const STATUS_LABELS: Record<BillingStatus, string> = {
  brouillon: 'Brouillon',
  emis: 'Émis',
  paye: 'Payé',
  annule: 'Annulé',
  refuse: 'Refusé',
};

/** Affichage d'un montant stocké en centimes, sans jamais repasser par un flottant intermédiaire. */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')} €`;
}

export default function BillingPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [enforcedRules, setEnforcedRules] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<BillingType>('devis');
  const [clientName, setClientName] = useState('');
  const [label, setLabel] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [vatPercent, setVatPercent] = useState('20');
  const [isSaving, setIsSaving] = useState(false);

  // Correction par avoir. Le document corrigé est tenu par son identifiant :
  // un avoir sans référence ne corrige rien, et le serveur le refuse.
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [creditLabel, setCreditLabel] = useState('');
  const [creditEuros, setCreditEuros] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([api.listBillingDocuments(token), api.getBillingLegalNotice(token)])
      .then(([list, notice]) => {
        setDocuments(list.documents);
        setDisclaimer(list.disclaimer);
        setEnforcedRules(notice.enforcedRules);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger la facturation.'),
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
    if (!token || !clientName.trim() || !label.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      // Saisie en euros, stockage en centimes : la conversion se fait une
      // seule fois, ici, et par arrondi explicite.
      const unitPriceCents = Math.round(Number(amountEuros.replace(',', '.')) * 100);
      const vatRateBasisPoints = Math.round(Number(vatPercent.replace(',', '.')) * 100);
      if (!Number.isFinite(unitPriceCents) || !Number.isFinite(vatRateBasisPoints)) {
        setError('Montant ou taux de TVA illisible.');
        return;
      }

      await api.createBillingDocument(token, {
        type,
        clientName: clientName.trim(),
        lines: [{ label: label.trim(), quantityMilli: 1000, unitPriceCents, vatRateBasisPoints }],
      });
      setClientName('');
      setLabel('');
      setAmountEuros('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer ce document.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatus(document: BillingDocument, status: BillingStatus) {
    if (!token) return;
    setError(null);
    try {
      await api.changeBillingStatus(token, document.id, status);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Changement de statut refusé.');
    }
  }

  async function handleDelete(document: BillingDocument) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteBillingDraft(token, document.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression refusée.');
    }
  }

  /**
   * Ouvre la correction d'une facture émise, montant pré-rempli au total :
   * l'avoir intégral est le cas courant, et une correction partielle reste
   * possible en changeant le montant.
   */
  function startCorrection(document: BillingDocument) {
    setCorrectingId(document.id);
    setCreditLabel(`Avoir sur ${document.number}`);
    setCreditEuros(
      `${Math.floor(document.totals.subtotalCents / 100)}.${String(
        document.totals.subtotalCents % 100,
      ).padStart(2, '0')}`,
    );
  }

  /**
   * L'avoir reprend le taux de TVA de la première ligne du document corrigé
   * plutôt qu'un taux saisi : corriger une facture à 5,5 % par un avoir à
   * 20 % produirait une TVA qui ne s'annule pas.
   */
  async function handleCredit(corrected: BillingDocument, e: FormEvent) {
    e.preventDefault();
    if (!token || !creditLabel.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      const unitPriceCents = Math.round(Number(creditEuros.replace(',', '.')) * 100);
      if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
        setError('Montant de l’avoir illisible.');
        return;
      }
      const vatRateBasisPoints = corrected.lines[0]?.vat_rate_basis_points ?? 0;

      await api.createBillingDocument(token, {
        type: 'avoir',
        clientName: corrected.client_name,
        correctsId: corrected.id,
        lines: [
          { label: creditLabel.trim(), quantityMilli: 1000, unitPriceCents, vatRateBasisPoints },
        ],
      });
      setCorrectingId(null);
      setCreditLabel('');
      setCreditEuros('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Avoir refusé.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePay(document: BillingDocument) {
    if (!token) return;
    setError(null);
    try {
      await api.addBillingPayment(token, document.id, document.remainingCents, 'virement');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Règlement refusé.');
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Facturation</h1>
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <div className="card">
        {enforcedRules.length > 0 && (
          <>
            <p style={{ marginTop: 0 }}>Ce qu&apos;Ignitux applique réellement :</p>
            <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
              {enforcedRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </>
        )}
        {disclaimer && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {disclaimer}
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Nouveau document</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            aria-label="Type de document"
            value={type}
            onChange={(e) => setType(e.target.value as BillingType)}
          >
            <option value="devis">Devis</option>
            <option value="facture">Facture</option>
          </select>
          <input
            aria-label="Nom du client"
            placeholder="Client"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
          <input
            aria-label="Désignation"
            placeholder="Désignation de la prestation"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Montant hors taxes en euros"
            placeholder="Montant HT (€)"
            value={amountEuros}
            onChange={(e) => setAmountEuros(e.target.value)}
          />
          <input
            aria-label="Taux de TVA en pourcentage"
            placeholder="TVA (%)"
            value={vatPercent}
            onChange={(e) => setVatPercent(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Création…' : 'Créer'}
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          Le taux de TVA est celui que tu saisis : Ignitux n&apos;en présume aucun, parce que les
          taux dépendent de ton activité et changent avec la réglementation.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Documents</h2>
        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && documents.length === 0 && (
          <p className="muted">Aucun document pour l&apos;instant.</p>
        )}
        <ul aria-label="Liste des documents" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {documents.map((document) => (
            <li
              key={document.id}
              className="project-item"
              style={{ cursor: 'default', marginBottom: '0.5rem' }}
            >
              <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                <strong>
                  {document.number} — {TYPE_LABELS[document.type]}
                </strong>
                <span className="muted">{STATUS_LABELS[document.status]}</span>
              </div>
              <p style={{ margin: 0 }}>{document.client_name}</p>
              {document.corrects_id && (
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  À déduire de{' '}
                  {documents.find((other) => other.id === document.corrects_id)?.number ??
                    'un document supprimé'}
                  .
                </p>
              )}
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {formatCents(document.totals.subtotalCents)} HT · TVA{' '}
                {formatCents(document.totals.vatCents)} · Total{' '}
                {formatCents(document.totals.totalCents)}
                {document.status !== 'brouillon' &&
                  ` · Reste dû ${formatCents(document.remainingCents)}`}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {document.status === 'brouillon' && (
                  <>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleStatus(document, 'emis')}
                    >
                      Émettre
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleDelete(document)}
                    >
                      Supprimer
                    </button>
                  </>
                )}
                {document.status === 'emis' && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handlePay(document)}
                  >
                    Marquer réglé
                  </button>
                )}
                {/* La règle « une facture émise ne se corrige que par un avoir »
                    était énoncée en haut de page sans être offerte nulle part.
                    Le geste existe maintenant là où la règle s'applique. */}
                {document.type === 'facture' &&
                  (document.status === 'emis' || document.status === 'paye') &&
                  correctingId !== document.id && (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => startCorrection(document)}
                    >
                      Corriger par un avoir
                    </button>
                  )}
                {document.status !== 'brouillon' && (
                  <span className="muted">
                    Émis : ce document ne peut plus être modifié ni supprimé.
                  </span>
                )}
              </div>

              {correctingId === document.id && (
                <form
                  onSubmit={(e) => void handleCredit(document, e)}
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginTop: '0.75rem',
                  }}
                >
                  <input
                    aria-label="Motif de l’avoir"
                    placeholder="Motif de l’avoir"
                    value={creditLabel}
                    onChange={(e) => setCreditLabel(e.target.value)}
                  />
                  <input
                    aria-label="Montant hors taxes à créditer en euros"
                    placeholder="Montant HT à créditer (€)"
                    value={creditEuros}
                    onChange={(e) => setCreditEuros(e.target.value)}
                  />
                  <button className="secondary" type="submit" disabled={isSaving}>
                    {isSaving ? 'Émission…' : 'Émettre l’avoir'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setCorrectingId(null)}
                  >
                    Annuler
                  </button>
                  <p className="muted" style={{ margin: 0, flexBasis: '100%' }}>
                    L’avoir reprend le taux de TVA de la facture corrigée. Il naît en brouillon :
                    il faudra l’émettre à son tour, et il portera alors son propre numéro.
                  </p>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
