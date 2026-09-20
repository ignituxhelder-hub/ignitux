'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import {
  api,
  ApiError,
  NATURES_DE_COMPTE,
  type BankAccount,
  type BankBalance,
  type BankTransaction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour } from '@/lib/montants';

const NATURES: Record<string, string> = {
  courant: 'Compte courant',
  reserve: 'Réserve',
  fiscal: 'Provision fiscale',
  investissement: 'Investissement',
  autre: 'Autre',
};

/**
 * LA BANQUE — un module qui existait sans porte.
 *
 * Le backend tenait les comptes, les mouvements, le solde et le
 * rapprochement depuis des semaines, testés, avec des routes. Aucun écran
 * ne les appelait : la seule façon d'y accéder était d'écrire des requêtes
 * HTTP à la main. Une fonctionnalité qu'on ne peut pas atteindre n'existe
 * pas du point de vue de la personne qui s'en servirait.
 *
 * ## Ce que cet écran ne fait pas, et le dit
 *
 * — **Aucune synchronisation bancaire.** Les mouvements se saisissent. La
 *   colonne `provider` existe en base pour le jour où une synchronisation
 *   arrivera ; laisser croire qu'elle est là ferait attendre des lignes
 *   qui ne viendront jamais.
 * — **Aucun rapprochement.** Rattacher un mouvement à son écriture
 *   comptable suppose de pouvoir choisir cette écriture, et la
 *   comptabilité n'a pas encore d'écran. Le compteur « à rapprocher »
 *   s'affiche quand même : c'est un fait, et le cacher donnerait
 *   l'impression que tout est rapproché.
 * — **Jamais l'IBAN entier.** Quatre caractères suffisent à reconnaître un
 *   compte ; stocker le reste serait garder une donnée bancaire complète
 *   pour un besoin qui n'existe pas.
 */
export default function BanquePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [comptes, setComptes] = useState<BankAccount[]>([]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [mouvements, setMouvements] = useState<BankTransaction[]>([]);
  const [solde, setSolde] = useState<BankBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const chargerComptes = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const liste = await api.listBankAccounts(token);
      setComptes(liste);
      setChoisi((actuel) => actuel ?? liste[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les comptes.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const chargerCompte = useCallback(async () => {
    if (!token || !choisi) {
      setMouvements([]);
      setSolde(null);
      return;
    }
    try {
      const [lignes, total] = await Promise.all([
        api.listBankTransactions(token, choisi),
        api.getBankBalance(token, choisi),
      ]);
      setMouvements(lignes);
      setSolde(total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger ce compte.');
    }
  }, [token, choisi]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void chargerComptes();
  }, [isReady, token, router, chargerComptes]);

  useEffect(() => {
    void chargerCompte();
  }, [chargerCompte]);

  if (!isReady || !token) return null;

  const compte = comptes.find((c) => c.id === choisi) ?? null;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Banque</h1>
      <p className="muted">
        Les mouvements se saisissent à la main : Ignitux ne se connecte à aucune banque, et ne
        prétend pas le faire. Ce que tu inscris ici est ce que tu as constaté sur ton relevé.
      </p>

      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice">
          <span>{message}</span>
        </p>
      )}
      {isLoading && <p className="loading">Chargement…</p>}

      {!isLoading && comptes.length === 0 && (
        <p className="muted">
          Aucun compte déclaré. Un compte dédié à l&apos;activité sépare tes flux
          professionnels de tes flux personnels — commence par le déclarer ci-dessous.
        </p>
      )}

      {comptes.length > 0 && (
        <div className="card">
          <div className="field">
            <label htmlFor="compte">Compte</label>
            <select id="compte" value={choisi ?? ''} onChange={(e) => setChoisi(e.target.value)}>
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {NATURES[c.kind] ?? c.kind}
                  {c.iban_last4 ? ` (…${c.iban_last4})` : ''}
                </option>
              ))}
            </select>
          </div>

          {solde && compte && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginTop: '1rem',
              }}
            >
              <Chiffre libelle="Solde" valeur={euros(solde.balanceCents)} />
              <Chiffre libelle="Mouvements" valeur={String(solde.movements)} />
              <Chiffre
                libelle="À rapprocher"
                valeur={`${solde.unreconciledCount} · ${euros(solde.unreconciledCents)}`}
              />
            </div>
          )}

          {solde && solde.unreconciledCount > 0 && (
            <p className="muted" style={{ marginBottom: 0, marginTop: '1rem' }}>
              Rapprocher un mouvement, c&apos;est le rattacher à l&apos;écriture comptable qui
              le constate. Cela demande de pouvoir choisir cette écriture, et la comptabilité
              n&apos;a pas encore d&apos;écran — ce compteur dit donc où en est le travail, pas
              qu&apos;il est en retard.
            </p>
          )}
        </div>
      )}

      {compte && (
        <>
          <SaisirUnMouvement
            compteId={compte.id}
            token={token}
            onFait={async (m) => {
              setMessage(m);
              await chargerCompte();
            }}
            onErreur={setError}
          />
          <Mouvements mouvements={mouvements} />
        </>
      )}

      <DeclarerUnCompte
        token={token}
        onFait={async (m) => {
          setMessage(m);
          await chargerComptes();
        }}
        onErreur={setError}
      />
    </main>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <span className="muted" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
        {libelle}
      </span>
      <strong style={{ display: 'block', fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </strong>
    </div>
  );
}

function Mouvements({ mouvements }: { mouvements: BankTransaction[] }) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Mouvements</h2>
      {mouvements.length === 0 && <p className="muted">Aucun mouvement sur ce compte.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {mouvements.map((m) => (
          <div className="project-item" style={{ cursor: 'default' }} key={m.id}>
            <div className="top-bar" style={{ gap: '1rem', alignItems: 'baseline' }}>
              <span>{m.label}</span>
              <strong
                style={{
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  color: m.amount_cents < 0 ? 'var(--warn, #b45309)' : 'var(--ok, #15803d)',
                }}
              >
                {euros(m.amount_cents)}
              </strong>
            </div>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              {jour(m.occurred_on)}
              {m.external_ref ? ` · réf. ${m.external_ref}` : ''}
              {m.reconciled_entry_id ? ' · rapproché' : ' · à rapprocher'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaisirUnMouvement({
  compteId,
  token,
  onFait,
  onErreur,
}: {
  compteId: string;
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (message: string) => void;
}) {
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [libelle, setLibelle] = useState('');
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const centimes = centimesDepuisEuros(montant);
    // Refusé ici plutôt qu'au serveur : le message y serait plus sec, et
    // la saisie aurait déjà été perdue en chemin.
    if (centimes === null) {
      onErreur('Montant illisible. Écris par exemple « -42,50 » pour un débit.');
      return;
    }
    if (centimes === 0) {
      onErreur('Un mouvement nul ne constate rien.');
      return;
    }

    setEnCours(true);
    try {
      await api.importBankTransaction(token, compteId, {
        amountCents: centimes,
        occurredOn: new Date(date).toISOString(),
        label: libelle.trim(),
        externalRef: reference.trim() || undefined,
      });
      setMontant('');
      setLibelle('');
      setReference('');
      await onFait('Mouvement enregistré.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer ce mouvement.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: '1.5rem' }} onSubmit={soumettre}>
      <h2 style={{ marginTop: 0 }}>Saisir un mouvement</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Le signe porte le sens : négatif pour une sortie, positif pour une entrée. La date est
        celle du relevé, pas celle de la saisie.
      </p>
      <div className="field">
        <label htmlFor="mouvement-libelle">Libellé</label>
        <input
          id="mouvement-libelle"
          required
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Achat de matériel"
        />
      </div>
      <div className="field">
        <label htmlFor="mouvement-montant">Montant en euros</label>
        <input
          id="mouvement-montant"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="-42,50"
          inputMode="text"
        />
      </div>
      <div className="field">
        <label htmlFor="mouvement-date">Date du relevé</label>
        <input
          id="mouvement-date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="mouvement-reference">Référence (facultatif)</label>
        <input
          id="mouvement-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Numéro d’opération du relevé"
        />
      </div>
      <button className="primary" type="submit" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le mouvement'}
      </button>
    </form>
  );
}

function DeclarerUnCompte({
  token,
  onFait,
  onErreur,
}: {
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (message: string) => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [nature, setNature] = useState<string>('courant');
  const [iban, setIban] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const quatre = iban.trim();
    if (quatre && quatre.length !== 4) {
      onErreur(
        'On n’enregistre que les quatre derniers caractères de l’IBAN — pas l’IBAN entier.',
      );
      return;
    }

    setEnCours(true);
    try {
      await api.declareBankAccount(token, {
        label: libelle.trim(),
        kind: nature,
        ibanLast4: quatre || undefined,
      });
      setLibelle('');
      setIban('');
      await onFait('Compte déclaré.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : 'Impossible de déclarer ce compte.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="card" style={{ marginTop: '1.5rem' }} onSubmit={soumettre}>
      <h2 style={{ marginTop: 0 }}>Déclarer un compte</h2>
      <div className="field">
        <label htmlFor="compte-libelle">Nom du compte</label>
        <input
          id="compte-libelle"
          required
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Compte pro — banque X"
        />
      </div>
      <div className="field">
        <label htmlFor="compte-nature">Nature</label>
        <select id="compte-nature" value={nature} onChange={(e) => setNature(e.target.value)}>
          {NATURES_DE_COMPTE.map((n) => (
            <option key={n} value={n}>
              {NATURES[n] ?? n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="compte-iban">Quatre derniers caractères de l’IBAN (facultatif)</label>
        <input
          id="compte-iban"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          // Pas de maxLength : il tronquerait un IBAN colle en silence,
          // alors que la regle est de refuser en disant pourquoi.
          placeholder="1234"
        />
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          Quatre caractères suffisent à reconnaître le compte. Ignitux ne stocke pas l’IBAN
          entier, et le refuserait si tu le collais ici.
        </p>
      </div>
      <button className="secondary" type="submit" disabled={enCours}>
        {enCours ? 'Déclaration…' : 'Déclarer ce compte'}
      </button>
    </form>
  );
}
