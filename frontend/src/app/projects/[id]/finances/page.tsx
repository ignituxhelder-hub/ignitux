'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import {
  api,
  ApiError,
  type CapTable,
  type DividendDistribution,
  type ProjectFinancingRegister,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centimesDepuisEuros, euros, jour, pourcentage } from '@/lib/montants';

const STATUTS: Record<string, string> = {
  ouvert: 'Ouvert au financement',
  finance: 'Financé',
  en_remboursement: 'En remboursement',
  solde: 'Soldé',
  arrete: 'Arrêté',
};

const MOUVEMENTS: Record<string, string> = {
  investissement: 'Apport',
  remboursement_capital: 'Remboursement de capital',
  dividende: 'Dividende',
  gain: 'Gain',
  correction: 'Correction',
};

/**
 * LE TABLEAU DE BORD FINANCIER D'UN PROJET, CÔTÉ PORTEUR.
 *
 * Le moteur d'investissement existait depuis des semaines sans qu'un seul
 * écran ne l'appelle : un porteur ne pouvait ni ouvrir son projet au
 * financement, ni enregistrer un apport, ni verser un dividende autrement
 * qu'en écrivant des requêtes HTTP à la main. Cette page est cette porte.
 *
 * Elle vit à part de la fiche projet, qui faisait déjà sept mille pixels.
 * L'argent mérite son propre écran : on n'y vient pas en passant.
 */
export default function ProjectFinancesPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [registre, setRegistre] = useState<ProjectFinancingRegister | null>(null);
  const [capTable, setCapTable] = useState<CapTable | null>(null);
  const [dividendes, setDividendes] = useState<DividendDistribution[]>([]);
  const [titre, setTitre] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [projet, financement, parts, versements] = await Promise.all([
        api.getProject(token, projectId),
        api.getProjectFinancing(token, projectId),
        api.getCapTable(token, projectId),
        api.listDividends(token, projectId),
      ]);
      setTitre(projet.title);
      setRegistre(financement);
      setCapTable(parts);
      setDividendes(versements.dividends);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger le financement.');
    } finally {
      setIsLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  if (!isReady || !token) return null;

  const finance = registre?.financedProject ?? null;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Brand />
        <Link href={`/projects/${projectId}`} className="muted">
          ← Retour au projet
        </Link>
      </div>

      <h1>Financement — {titre || 'projet'}</h1>

      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice">
          <span>{message}</span>
        </p>
      )}
      {isLoading && <p className="loading">Chargement…</p>}

      {!isLoading && !finance && (
        <OuvrirLeFinancement
          onOuvert={async () => {
            setMessage('Le projet est ouvert au financement.');
            await charger();
          }}
          onErreur={setError}
          projectId={projectId}
          token={token}
        />
      )}

      {finance && registre && (
        <>
          <div className="card">
            <div className="top-bar" style={{ marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Financements reçus</h2>
              <span className="muted">{STATUTS[finance.status] ?? finance.status}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
              }}
            >
              <Chiffre libelle="Levé" valeur={euros(registre.raisedCents)} />
              <Chiffre
                libelle="Objectif"
                valeur={finance.target_cents === null ? '—' : euros(finance.target_cents)}
              />
              <Chiffre libelle="Remboursé" valeur={euros(registre.totals.repaidCents)} />
              <Chiffre libelle="Dividendes versés" valeur={euros(registre.totals.dividendsCents)} />
            </div>
            {finance.target_cents === null && (
              <p className="muted" style={{ marginBottom: 0, marginTop: '1rem' }}>
                Aucun objectif de levée n&apos;a été annoncé. Ignitux n&apos;en invente pas :
                sans cible déclarée, il n&apos;y a pas de pourcentage d&apos;avancement à
                afficher.
              </p>
            )}
            <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
              Ouvert le {jour(finance.opened_on)}.
            </p>
          </div>

          <Investisseurs registre={registre} />

          <Capital capTable={capTable} />

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Enregistrer un mouvement</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Ce qui est enregistré ici est un fait, pas une prévision : la date est celle du
              virement, pas celle de la saisie. Rien ne s&apos;annule — une erreur se corrige
              par une écriture de correction, qui référence celle qu&apos;elle rectifie.
            </p>
            <FormulaireApport
              financedProjectId={finance.id}
              token={token}
              onFait={async (m) => {
                setMessage(m);
                await charger();
              }}
              onErreur={setError}
            />
            <FormulaireVersement
              financedProjectId={finance.id}
              token={token}
              onFait={async (m) => {
                setMessage(m);
                await charger();
              }}
              onErreur={setError}
            />
          </div>

          <Historique registre={registre} />

          <Dividendes dividendes={dividendes} />
        </>
      )}
    </main>
  );
}

// ── Ouvrir le projet au financement ─────────────────────────────────────────

function OuvrirLeFinancement({
  projectId,
  token,
  onOuvert,
  onErreur,
}: {
  projectId: string;
  token: string;
  onOuvert: () => Promise<void>;
  onErreur: (m: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [objectif, setObjectif] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      const cible = objectif.trim() === '' ? undefined : centimesDepuisEuros(objectif);
      if (cible !== undefined && (cible === null || cible <= 0)) {
        onErreur('Objectif de levée illisible.');
        return;
      }
      await api.openProjectFinancing(token, {
        projectId,
        openedOn: date,
        ...(cible === undefined ? {} : { targetCents: cible }),
      });
      await onOuvert();
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : "L'ouverture a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Ce projet n&apos;est pas ouvert au financement</h2>
      <p className="muted">
        L&apos;ouvrir crée un registre distinct du projet : il survivra au projet s&apos;il
        disparaît, pour que l&apos;argent que d&apos;autres y ont mis reste traçable. Tous les
        projets n&apos;ont pas à l&apos;être — seulement ceux qui cherchent de l&apos;argent.
      </p>
      <form onSubmit={soumettre} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label className="field" style={{ marginBottom: 0 }} htmlFor="ouverture-date">
          <span>Date d&apos;ouverture</span>
          <input
            id="ouverture-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }} htmlFor="ouverture-objectif">
          <span>Objectif de levée (€, facultatif)</span>
          <input
            id="ouverture-objectif"
            value={objectif}
            onChange={(e) => setObjectif(e.target.value)}
            placeholder="laisser vide si aucun"
          />
        </label>
        <button className="primary" type="submit" disabled={enCours} style={{ alignSelf: 'end' }}>
          {enCours ? 'Ouverture…' : 'Ouvrir au financement'}
        </button>
      </form>
    </div>
  );
}

// ── Les investisseurs du projet ─────────────────────────────────────────────

function Investisseurs({ registre }: { registre: ProjectFinancingRegister }) {
  // Un investisseur peut avoir plusieurs apports : on regroupe, sinon la même
  // personne apparaîtrait trois fois et le décompte mentirait.
  const parInvestisseur = new Map<
    string,
    { nom: string; apports: number; investi: number; parts: number | null }
  >();
  for (const p of registre.participations) {
    const existant = parInvestisseur.get(p.investor_id);
    const nom = p.investor?.display_name ?? 'Investisseur';
    const parts = p.share_basis_points_granted;
    parInvestisseur.set(p.investor_id, {
      nom,
      apports: (existant?.apports ?? 0) + 1,
      investi: (existant?.investi ?? 0) + p.invested_cents,
      parts: parts === null ? (existant?.parts ?? null) : (existant?.parts ?? 0) + parts,
    });
  }
  const lignes = [...parInvestisseur.values()].sort((a, b) => b.investi - a.investi);

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Investisseurs</h2>
      {lignes.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun apport enregistré.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lignes.map((ligne) => (
            <li
              key={ligne.nom}
              className="project-item"
              style={{ cursor: 'default', marginBottom: '0.5rem' }}
            >
              <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                <strong>{ligne.nom}</strong>
                <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {euros(ligne.investi)}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {ligne.apports} apport(s)
                {ligne.parts !== null && ligne.parts > 0
                  ? ` · ${pourcentage(ligne.parts)} accordé(s) à l'apport`
                  : " · aucune part accordée à l'apport"}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
        Les parts indiquées ici sont celles <strong>accordées au moment de l&apos;apport</strong>.
        La répartition d&apos;aujourd&apos;hui se lit ci-dessous : c&apos;est elle qui fait foi.
      </p>
    </div>
  );
}

// ── La répartition du capital, aujourd'hui ──────────────────────────────────

function Capital({ capTable }: { capTable: CapTable | null }) {
  if (!capTable) return null;
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Répartition du capital</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {capTable.notice}
      </p>
      {capTable.holders.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun détenteur enregistré.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {capTable.holders.map((detenteur) => (
            <li
              key={detenteur.holderId}
              className="top-bar"
              style={{ marginBottom: '0.4rem', cursor: 'default' }}
            >
              <span>
                {detenteur.name}
                {detenteur.isFounder && <span className="muted"> · fondateur</span>}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {detenteur.shareBasisPoints === null
                  ? '—'
                  : pourcentage(detenteur.shareBasisPoints)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {capTable.discrepancyBasisPoints !== 0 && (
        <p className="error" style={{ marginBottom: 0 }}>
          La répartition totalise {pourcentage(capTable.totalBasisPoints)} au lieu de 100 %.
          Ignitux ne redistribue pas l&apos;écart automatiquement : ce serait décider à la
          place des personnes qui détiennent ces parts.
        </p>
      )}
    </div>
  );
}

// ── L'historique des mouvements ─────────────────────────────────────────────

function Historique({ registre }: { registre: ProjectFinancingRegister }) {
  const mouvements = [...registre.movements].reverse();
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Historique</h2>
      {mouvements.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun mouvement enregistré.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {mouvements.map((m) => (
            <li
              key={m.id}
              className="top-bar"
              style={{ marginBottom: '0.4rem', cursor: 'default', alignItems: 'baseline' }}
            >
              <span>
                <span className="muted">{jour(m.occurred_on)}</span>{' '}
                {MOUVEMENTS[m.kind] ?? m.kind}
                {m.reference && <span className="muted"> · {m.reference}</span>}
                {m.corrects_movement_id && (
                  <span className="muted"> · rectifie une écriture antérieure</span>
                )}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{euros(m.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
        Un montant négatif est de l&apos;argent qui entre dans le projet : c&apos;est
        l&apos;investisseur qui verse. Rien n&apos;est jamais supprimé de cette liste.
      </p>
    </div>
  );
}

// ── Les dividendes déjà versés ──────────────────────────────────────────────

function Dividendes({ dividendes }: { dividendes: DividendDistribution[] }) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Dividendes versés</h2>
      {dividendes.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucun dividende versé. Ignitux n&apos;affiche pas de dividende prévisionnel : un
          dividende se constate après coup, le prédire reviendrait à promettre un revenu.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {dividendes.map((d) => (
            <li
              key={d.id}
              className="top-bar"
              style={{ marginBottom: '0.4rem', cursor: 'default' }}
            >
              <span>
                <span className="muted">{jour(d.occurred_at)}</span>{' '}
                {d.holder?.name ?? 'Détenteur'}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{euros(d.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Les deux formulaires de saisie ──────────────────────────────────────────

function FormulaireApport({
  financedProjectId,
  token,
  onFait,
  onErreur,
}: {
  financedProjectId: string;
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (m: string) => void;
}) {
  const [investorId, setInvestorId] = useState('');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [parts, setParts] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      const cents = centimesDepuisEuros(montant);
      if (cents === null || cents <= 0) {
        onErreur('Montant de l’apport illisible.');
        return;
      }
      const pourcent = parts.trim() === '' ? undefined : Number(parts.replace(',', '.'));
      if (pourcent !== undefined && (!Number.isFinite(pourcent) || pourcent < 0 || pourcent > 100)) {
        onErreur('La part accordée va de 0 à 100 %.');
        return;
      }
      await api.recordParticipation(token, financedProjectId, {
        investorId: investorId.trim(),
        investedCents: cents,
        occurredOn: date,
        ...(pourcent === undefined ? {} : { shareBasisPointsGranted: Math.round(pourcent * 100) }),
      });
      setMontant('');
      setParts('');
      await onFait('Apport enregistré.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : "L'apport n'a pas pu être enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form
      onSubmit={soumettre}
      aria-labelledby="titre-apport"
      style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.5rem' }}
    >
      <h3 id="titre-apport" style={{ flexBasis: '100%', margin: 0 }}>
        Un apport reçu
      </h3>
      <label
        className="field"
        style={{ marginBottom: 0, flexBasis: '100%' }}
        htmlFor="apport-investisseur"
      >
        <span>Identifiant de l&apos;investisseur</span>
        <input
          id="apport-investisseur"
          value={investorId}
          onChange={(e) => setInvestorId(e.target.value)}
          placeholder="collé depuis ce que l’investisseur t’a communiqué"
          required
        />
        {/* Pas de recherche par email, et c’est délibéré : elle laisserait
            n’importe qui vérifier si une adresse appartient à un
            investisseur. L’identifiant se transmet parce que son porteur
            a décidé de le transmettre. */}
        <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
          L&apos;investisseur le trouve dans son espace, sous « Mon identifiant ». Ignitux
          ne propose pas de recherche par email : elle permettrait de savoir qui investit.
        </span>
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="apport-montant">
        <span>Montant apporté (€)</span>
        <input
          id="apport-montant"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="apport-date">
        <span>Date de l&apos;apport</span>
        <input
          id="apport-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="apport-parts">
        <span>Part accordée (%, facultatif)</span>
        <input
          id="apport-parts"
          value={parts}
          onChange={(e) => setParts(e.target.value)}
          placeholder="ex. 12"
        />
      </label>
      <button className="secondary" type="submit" disabled={enCours} style={{ alignSelf: 'end' }}>
        {enCours ? 'Enregistrement…' : 'Enregistrer un apport'}
      </button>
    </form>
  );
}

function FormulaireVersement({
  financedProjectId,
  token,
  onFait,
  onErreur,
}: {
  financedProjectId: string;
  token: string;
  onFait: (message: string) => Promise<void>;
  onErreur: (m: string) => void;
}) {
  const [nature, setNature] = useState<'remboursement' | 'dividende'>('remboursement');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [partPerpetuelle, setPartPerpetuelle] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      const cents = centimesDepuisEuros(montant);
      if (cents === null || cents <= 0) {
        onErreur('Montant du versement illisible.');
        return;
      }
      const commun = {
        amountCents: cents,
        occurredOn: date,
        ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
      };
      if (nature === 'remboursement') {
        await api.recordRepayment(token, financedProjectId, commun);
      } else {
        await api.recordInvestorDividend(token, financedProjectId, {
          ...commun,
          applyPerpetualShare: partPerpetuelle,
        });
      }
      setMontant('');
      setReference('');
      await onFait(nature === 'remboursement' ? 'Remboursement enregistré.' : 'Dividende réparti.');
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : "Le versement n'a pas pu être enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form
      onSubmit={soumettre}
      aria-labelledby="titre-versement"
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginTop: '2rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid var(--border)',
      }}
    >
      <h3 id="titre-versement" style={{ flexBasis: '100%', margin: 0 }}>
        Un versement aux investisseurs
      </h3>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="versement-nature">
        <span>Nature</span>
        <select
          id="versement-nature"
          value={nature}
          onChange={(e) => setNature(e.target.value as 'remboursement' | 'dividende')}
        >
          <option value="remboursement">Remboursement de capital</option>
          <option value="dividende">Dividende</option>
        </select>
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="versement-montant">
        <span>Montant total à répartir (€)</span>
        <input
          id="versement-montant"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="versement-date">
        <span>Date du versement</span>
        <input
          id="versement-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="field" style={{ marginBottom: 0 }} htmlFor="versement-reference">
        <span>Référence (facultatif)</span>
        <input
          id="versement-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="n° de virement"
        />
      </label>
      {nature === 'dividende' && (
        <label
          className="field"
          style={{ marginBottom: 0, flexBasis: '100%', flexDirection: 'row', gap: '0.5rem' }}
          htmlFor="versement-part-perpetuelle"
        >
          <input
            id="versement-part-perpetuelle"
            type="checkbox"
            checked={partPerpetuelle}
            onChange={(e) => setPartPerpetuelle(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>
            Prélever la part perpétuelle de 5 % (modèle IGNITUX 51/49). À cocher
            explicitement : tous les projets ne sont pas entrés au capital selon ce modèle.
          </span>
        </label>
      )}
      <button className="secondary" type="submit" disabled={enCours} style={{ alignSelf: 'end' }}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le versement'}
      </button>
    </form>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        {libelle}
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </p>
    </div>
  );
}
