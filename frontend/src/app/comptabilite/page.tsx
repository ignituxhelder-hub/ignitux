'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import {
  api,
  ApiError,
  NATURES_DE_COMPTE_COMPTABLE,
  type LedgerAccount,
  type LedgerEntry,
  type TrialBalance,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

const NATURES: Record<string, string> = {
  actif: 'Actif',
  passif: 'Passif',
  capitaux: 'Capitaux',
  produit: 'Produit',
  charge: 'Charge',
};

/**
 * LA COMPTABILITÉ — le dernier module qui n'avait pas de porte.
 *
 * ## Aucun plan comptable n'est déposé d'office
 *
 * Le serveur n'en impose aucun, et l'écran non plus. Un entrepreneur
 * portugais, suisse ou français n'a ni le même plan, ni le même régime,
 * ni les mêmes obligations : lui installer une liste française par défaut
 * serait exactement la donnée inventée que le produit refuse ailleurs.
 * Il ouvre les comptes dont il a besoin.
 *
 * ## Une écriture à deux lignes, et c'est un choix
 *
 * Le serveur accepte des écritures à N lignes. Cet écran n'en propose que
 * deux — un compte débité, un compte crédité, un montant — et le fait
 * exprès : ainsi construite, une écriture ne PEUT pas être déséquilibrée.
 * Une grille libre laisserait saisir un débit de 100 contre un crédit de
 * 90, faire rejeter l'envoi, et perdre la saisie. Les écritures à trois
 * lignes et plus existent ; elles attendront un écran qui les mérite,
 * plutôt qu'un formulaire qui les rate.
 */
export default function ComptabilitePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [comptes, setComptes] = useState<LedgerAccount[]>([]);
  const [ecritures, setEcritures] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState<TrialBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [plan, journal, totaux] = await Promise.all([
        api.listLedgerAccounts(token),
        api.listLedgerEntries(token),
        api.getTrialBalance(token),
      ]);
      setComptes(plan);
      setEcritures(journal);
      setBalance(totaux);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger la comptabilité.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  if (!isReady || !token) return null;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Comptabilité</h1>
      <p className="muted">
        Ces livres sont les tiens. Ignitux n&apos;y dépose aucun plan comptable tout fait :
        selon le pays et le régime, ce ne serait pas le bon. Ce n&apos;est pas non plus un
        logiciel de comptabilité certifié — c&apos;est un registre juste, à confronter à ton
        expert-comptable.
      </p>

      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice">
          <span>{message}</span>
        </p>
      )}
      {isLoading && <p className="loading">Chargement…</p>}

      {!isLoading && <Balance balance={balance} />}

      {comptes.length >= 2 && (
        <SaisirUneEcriture
          comptes={comptes}
          token={token}
          onFait={async (m) => {
            setMessage(m);
            await charger();
          }}
          onErreur={setError}
        />
      )}
      {!isLoading && comptes.length < 2 && (
        <p className="muted">
          Une écriture déplace un montant d&apos;un compte vers un autre : il en faut donc au
          moins deux avant de pouvoir en saisir une.
        </p>
      )}

      <Journal ecritures={ecritures} />

      <OuvrirUnCompte
        token={token}
        onFait={async (m) => {
          setMessage(m);
          await charger();
        }}
        onErreur={setError}
      />
    </main>
  );
}

function Balance({ balance }: { balance: TrialBalance | null }) {
  if (!balance) return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Balance</h2>
      {balance.lines.length === 0 && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun compte ouvert. La balance apparaîtra dès qu&apos;il y aura quelque chose à
          totaliser.
        </p>
      )}
      {balance.lines.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem' }}>Compte</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Débit</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Crédit</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Solde</th>
                </tr>
              </thead>
              <tbody>
                {balance.lines.map((ligne) => (
                  <tr key={ligne.accountId}>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ligne.code}</span>{' '}
                      {ligne.label}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '0.4rem 0.5rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {euros(ligne.debitCents)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '0.4rem 0.5rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {euros(ligne.creditCents)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '0.4rem 0.5rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {euros(ligne.balanceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* La seule ligne qui compte vraiment. Un déséquilibre ne se
              rattrape pas en relisant : il se voit ici, ou pas du tout. */}
          <p style={{ marginBottom: 0, marginTop: '0.75rem' }}>
            {balance.balanced ? (
              <span className="muted">
                Débits et crédits se répondent : {euros(balance.totalDebitCents)} de chaque
                côté.
              </span>
            ) : (
              <strong style={{ color: 'var(--warn, #b45309)' }}>
                Déséquilibre : {euros(balance.totalDebitCents)} au débit contre{' '}
                {euros(balance.totalCreditCents)} au crédit. Une comptabilité en partie double
                équilibre toujours — il manque un montant quelque part.
              </strong>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function Journal({ ecritures }: { ecritures: LedgerEntry[] }) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Écritures</h2>
      {ecritures.length === 0 && <p className="muted">Aucune écriture enregistrée.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ecritures.map((e) => (
          <div className="project-item" style={{ cursor: 'default' }} key={e.id}>
            <div className="top-bar" style={{ gap: '1rem', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>{e.label}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                {jour(e.occurred_on)}
              </span>
            </div>
            {e.reference && (
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                réf. {e.reference}
              </span>
            )}
            <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
              {e.lines.map((l) => (
                <li
                  key={l.id}
                  className="muted"
                  style={{ fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}
                >
                  {l.account ? `${l.account.code} ${l.account.label}` : l.account_id} —{' '}
                  {l.debit_cents > 0
                    ? `débit ${euros(l.debit_cents)}`
                    : `crédit ${euros(l.credit_cents)}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaisirUneEcriture({
  comptes,
  token,
  onFait,
  onErreur,
}: {
  comptes: LedgerAccount[];
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (message: string) => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [debite, setDebite] = useState(comptes[0]?.id ?? '');
  const [credite, setCredite] = useState(comptes[1]?.id ?? '');
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();

    if (debite === credite) {
      onErreur(
        'Un compte ne peut pas être à la fois débité et crédité de la même somme : ' +
          'l’écriture ne constaterait rien.',
      );
      return;
    }
    const centimes = centimesDepuisEuros(montant);
    if (centimes === null) {
      onErreur('Montant illisible. Écris par exemple « 1250,00 ».');
      return;
    }
    if (centimes <= 0) {
      onErreur(
        'Le montant se saisit en positif : le sens est porté par les deux comptes choisis, ' +
          'pas par un signe.',
      );
      return;
    }

    setEnCours(true);
    try {
      await api.recordLedgerEntry(token, {
        occurredOn: new Date(date).toISOString(),
        label: libelle.trim(),
        reference: reference.trim() || undefined,
        lines: [
          { accountId: debite, debitCents: centimes, creditCents: 0 },
          { accountId: credite, debitCents: 0, creditCents: centimes },
        ],
      });
      setLibelle('');
      setMontant('');
      setReference('');
      await onFait('Écriture enregistrée.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette écriture.');
    } finally {
      setEnCours(false);
    }
  }

  const nom = (c: LedgerAccount) => `${c.code} — ${c.label}`;

  return (
    <form className="card" style={{ marginTop: '1.5rem' }} onSubmit={soumettre}>
      <h2 style={{ marginTop: 0 }}>Saisir une écriture</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Un compte est débité, un autre est crédité, du même montant. Écrite ainsi,
        l&apos;écriture est équilibrée par construction — il n&apos;y a pas de façon de se
        tromper de somme d&apos;un côté.
      </p>
      <div className="field">
        <label htmlFor="ecriture-libelle">Libellé</label>
        <input
          id="ecriture-libelle"
          required
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Ce qu’on relira dans six mois"
        />
      </div>
      <div className="field">
        <label htmlFor="ecriture-debite">Compte débité</label>
        <select id="ecriture-debite" value={debite} onChange={(e) => setDebite(e.target.value)}>
          {comptes.map((c) => (
            <option key={c.id} value={c.id}>
              {nom(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ecriture-credite">Compte crédité</label>
        <select id="ecriture-credite" value={credite} onChange={(e) => setCredite(e.target.value)}>
          {comptes.map((c) => (
            <option key={c.id} value={c.id}>
              {nom(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ecriture-montant">Montant en euros</label>
        <input
          id="ecriture-montant"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="1250,00"
        />
      </div>
      <div className="field">
        <label htmlFor="ecriture-date">Date de l’opération</label>
        <input
          id="ecriture-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          Celle de l’opération, pas celle de la saisie.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ecriture-reference">Référence (facultatif)</label>
        <input
          id="ecriture-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Numéro de facture, de relevé…"
        />
      </div>
      <button className="primary" type="submit" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer l’écriture'}
      </button>
    </form>
  );
}

function OuvrirUnCompte({
  token,
  onFait,
  onErreur,
}: {
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const [nature, setNature] = useState<string>('charge');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      await api.openLedgerAccount(token, {
        code: code.trim(),
        label: libelle.trim(),
        kind: nature,
      });
      setCode('');
      setLibelle('');
      await onFait('Compte ouvert.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : 'Impossible d’ouvrir ce compte.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: '1.5rem' }} onSubmit={soumettre}>
      <h2 style={{ marginTop: 0 }}>Ouvrir un compte</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Le code est le tien. Si tu suis le plan comptable général français, « 512 » pour la
        banque et « 706 » pour les prestations parleront à ton comptable — mais rien ne
        t&apos;y oblige.
      </p>
      <div className="field">
        <label htmlFor="plan-code">Code</label>
        <input
          id="plan-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="512"
        />
      </div>
      <div className="field">
        <label htmlFor="plan-libelle">Intitulé</label>
        <input
          id="plan-libelle"
          required
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Banque — compte courant"
        />
      </div>
      <div className="field">
        <label htmlFor="plan-nature">Nature</label>
        <select id="plan-nature" value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES_DE_COMPTE_COMPTABLE.map((n) => (
            <option key={n} value={n}>
              {NATURES[n] ?? n}
            </option>
          ))}
        </select>
      </div>
      <button className="secondary" type="submit" disabled={enCours}>
        {enCours ? 'Ouverture…' : 'Ouvrir ce compte'}
      </button>
    </form>
  );
}
