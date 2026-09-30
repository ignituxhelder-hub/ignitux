'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RoleBar } from '@/components/role-bar';
import {
  api,
  ApiError,
  type InvestorMovement,
  type InvestorPortfolio,
  type InvestorSpace,
  type ParticipationRow,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BETA_V1_ACTIF } from '@/lib/beta-v1';
import { euros, jour, pourcentage } from '@/lib/montants';
import { useRoles } from '@/lib/roles';

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
 * L'ESPACE INVESTISSEUR.
 *
 * Il ne montre que de l'argent qui a réellement bougé. Aucun rendement
 * prévisionnel, aucune valorisation, aucune projection : ce sont les trois
 * chiffres qu'un tableau de bord d'investissement affiche d'habitude, et les
 * trois qu'Ignitux ne peut pas produire honnêtement.
 *
 * Les projets ne se compensent pas entre eux. Chaque ligne totalise ses
 * propres mouvements, et le total global est la somme des lignes — pas un
 * chiffre calculé à part qui finirait par en différer.
 */
export default function InvestorSpacePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const { roles, switchTo } = useRoles(token, 'investisseur');

  const [space, setSpace] = useState<InvestorSpace | null>(null);
  const [portefeuille, setPortefeuille] = useState<InvestorPortfolio | null>(null);
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const espace = await api.getInvestorSpace(token);
      setSpace(espace);
      setPortefeuille(null);
      setRefus(null);
      // Les participations ne se lisent que si un investisseur existe :
      // sinon la route répond 404, ce qui serait un faux problème.
      setParticipations(espace.investorId ? await api.listMyParticipations(token) : []);
      setError(null);
    } catch (err) {
      // 403 = le rôle n'est pas pris. Ce n'est pas forcément une impasse :
      // quelqu'un dont l'argent est placé quelque part doit pouvoir le lire
      // même sans avoir jamais coché la case « investisseur ». On tente
      // donc le portefeuille sans rôle avant d'afficher un refus.
      if (err instanceof ApiError && err.status === 403) {
        try {
          const vue = await api.getMyPortfolio(token);
          setSpace(null);
          setPortefeuille(vue);
          setParticipations(await api.listMyParticipations(token));
          setRefus(null);
          setError(null);
        } catch {
          setSpace(null);
          setPortefeuille(null);
          setParticipations([]);
          setRefus(err.message);
        }
      } else {
        setError(err instanceof ApiError ? err.message : "Impossible de charger l'espace.");
      }
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
    // Hors périmètre de la bêta V1 (voir lib/beta-v1.ts) : le vrai garde est
    // côté serveur, ceci ne fait qu'éviter d'atterrir sur une page qui
    // n'affichera jamais rien.
    if (BETA_V1_ACTIF) {
      router.replace('/accueil');
      return;
    }
    void charger();
  }, [isReady, token, router, charger]);

  if (!isReady || !token || BETA_V1_ACTIF) return null;

  return (
    <main className="page page--wide">
      <RoleBar roles={roles} onSwitch={switchTo} />

      <h1>Mon portefeuille</h1>

      {refus && (
        <div className="card">
          <p style={{ marginTop: 0 }}>{refus}</p>
          <Link className="primary" href="/roles" style={{ display: 'inline-block' }}>
            Prendre le rôle Investisseur
          </Link>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {space && !space.investorId && (
        <SeDeclarer token={token} onFait={charger} onErreur={setError} />
      )}

      {space && space.investorId && (
        <>
          <MonIdentifiant investorId={space.investorId} nom={space.displayName} />

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Portefeuille global</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              <Chiffre libelle="Montant investi" valeur={euros(space.global.investedCents)} />
              <Chiffre libelle="Capital récupéré" valeur={euros(space.global.repaidCents)} />
              <Chiffre libelle="Dividendes reçus" valeur={euros(space.global.dividendsCents)} />
              <Chiffre libelle="Projets" valeur={String(space.global.projectCount)} />
            </div>
            <p className="muted" style={{ marginBottom: 0, marginTop: '1rem' }}>
              Solde net : <strong>{euros(space.global.netCents)}</strong> — ce qui est revenu
              moins ce qui a été mis. Négatif tant que le capital n&apos;est pas rentré, et
              c&apos;est normal au début.
            </p>
          </div>

          <p className="notice" style={{ marginTop: '1.5rem' }}>
            <span>{space.notice}</span>
          </p>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Mes investissements</h2>
            {space.lines.length === 0 ? (
              /*
               * L'état vide disait « Aucun investissement enregistré » et
               * s'arrêtait là. L'explication existe bien — dans la carte
               * « Mon identifiant », juste au-dessus — mais elle est lue
               * avant qu'on se pose la question. Quelqu'un qui arrive ici
               * voit un portefeuille vide et aucune liste de projets : sans
               * ce rappel, la lecture la plus naturelle est « le produit ne
               * marche pas », pas « personne ne m'a encore enregistré ».
               */
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Aucun investissement enregistré pour l&apos;instant.
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  C&apos;est normal tant que personne ne t&apos;a inscrit : Ignitux tient le
                  registre de tes investissements, il ne les organise pas. Un apport apparaît
                  ici quand le porteur du projet l&apos;enregistre, avec l&apos;identifiant
                  ci-dessus.
                </p>
              </>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {space.lines.map((ligne) => (
                  <LigneProjet key={ligne.financedProjectId} ligne={ligne} token={token} />
                ))}
              </ul>
            )}
          </div>

          <Participations participations={participations} />
        </>
      )}

      {portefeuille && (
        <>
          <MonIdentifiant investorId={portefeuille.investorId} nom={portefeuille.displayName} />

          <p className="notice" style={{ marginTop: '1.5rem' }}>
            <span>
              Cette vue montre les montants sans la part détenue dans chaque projet, parce que
              le rôle Investisseur n&apos;est pas pris.{' '}
              <Link href="/roles">Prendre le rôle Investisseur</Link> pour voir aussi ta part.
            </span>
          </p>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Portefeuille global</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
              }}
            >
              <Chiffre libelle="Montant investi" valeur={euros(portefeuille.global.investedCents)} />
              <Chiffre libelle="Capital récupéré" valeur={euros(portefeuille.global.repaidCents)} />
              <Chiffre libelle="Dividendes reçus" valeur={euros(portefeuille.global.dividendsCents)} />
              <Chiffre libelle="Projets" valeur={String(portefeuille.parProjet.length)} />
            </div>
            <p className="muted" style={{ marginBottom: 0, marginTop: '1rem' }}>
              Solde net : <strong>{euros(portefeuille.global.netCents)}</strong> — ce qui est
              revenu moins ce qui a été mis. Négatif tant que le capital n&apos;est pas rentré,
              et c&apos;est normal au début.
            </p>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h2 style={{ marginTop: 0 }}>Mes investissements</h2>
            {portefeuille.parProjet.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Aucun investissement enregistré pour l&apos;instant.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {portefeuille.parProjet.map((ligne) => (
                  <LigneProjet
                    key={ligne.financedProjectId}
                    ligne={versLigneEspace(ligne)}
                    token={token}
                  />
                ))}
              </ul>
            )}
          </div>

          <Participations participations={participations} />
        </>
      )}
    </main>
  );
}

/**
 * Adapte une ligne du portefeuille sans rôle à la forme attendue par
 * `LigneProjet`, sans dupliquer son affichage ni son historique dépliable.
 * La part détenue n'existe pas hors du rôle Investisseur : ce n'est pas une
 * omission, c'est ce que dit `shareNotice`.
 */
function versLigneEspace(ligne: InvestorPortfolio['parProjet'][number]): InvestorSpace['lines'][number] {
  return {
    financedProjectId: ligne.financedProjectId,
    projectId: ligne.projectId,
    projectTitle: ligne.projectTitle,
    status: ligne.status,
    investedCents: ligne.totals.investedCents,
    repaidCents: ligne.totals.repaidCents,
    dividendsCents: ligne.totals.dividendsCents,
    gainsCents: ligne.totals.gainsCents,
    netCents: ligne.totals.netCents,
    shareBasisPoints: null,
    shareNotice: 'La part détenue ne s’affiche pas ici : elle suppose le rôle Investisseur.',
    participations: ligne.participations,
  };
}

// ── Se déclarer investisseur ────────────────────────────────────────────────

/**
 * Personne ne pouvait devenir investisseur depuis l'interface : la route
 * existait, aucun écran ne l'appelait. Un espace vide qui ne dit pas comment
 * cesser de l'être est une impasse.
 */
function SeDeclarer({
  token,
  onFait,
  onErreur,
}: {
  token: string;
  onFait: () => Promise<void>;
  onErreur: (m: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [nature, setNature] = useState('personne');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (nom.trim() === '') return;
    setEnCours(true);
    try {
      await api.registerAsInvestor(token, nom.trim(), nature);
      await onFait();
    } catch (err) {
      onErreur(err instanceof ApiError ? err.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Te déclarer investisseur</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Aucun investissement n&apos;est encore enregistré à ton nom. Te déclarer crée ton
        identifiant d&apos;investisseur : c&apos;est lui que tu communiqueras au porteur d&apos;un
        projet pour qu&apos;il puisse enregistrer ton apport. Cela n&apos;engage rien et
        n&apos;investit rien.
      </p>
      <form onSubmit={soumettre} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label className="field" style={{ marginBottom: 0 }} htmlFor="investisseur-nom">
          <span>Nom sous lequel tu investis</span>
          <input
            id="investisseur-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="ton nom, ou celui de ta société"
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }} htmlFor="investisseur-nature">
          <span>Nature</span>
          <select
            id="investisseur-nature"
            value={nature}
            onChange={(e) => setNature(e.target.value)}
          >
            <option value="personne">Personne</option>
            <option value="societe">Société</option>
          </select>
        </label>
        <button className="primary" type="submit" disabled={enCours} style={{ alignSelf: 'end' }}>
          {enCours ? 'Enregistrement…' : 'Me déclarer investisseur'}
        </button>
      </form>
    </div>
  );
}

// ── Mon identifiant, à communiquer ──────────────────────────────────────────

function MonIdentifiant({ investorId, nom }: { investorId: string; nom: string | null }) {
  const [copie, setCopie] = useState(false);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Mon identifiant</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {nom ? `Tu investis sous le nom « ${nom} ». ` : ''}
        Communique cet identifiant au porteur d&apos;un projet pour qu&apos;il enregistre ton
        apport. Ignitux ne propose aucune recherche d&apos;investisseur par email :
        elle permettrait à quiconque de savoir qui investit.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{investorId}</code>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            // Le presse-papiers peut être refusé (contexte non sécurisé,
            // permission) : on ne prétend pas avoir copié si ça a échoué.
            navigator.clipboard
              ?.writeText(investorId)
              .then(() => setCopie(true))
              .catch(() => setCopie(false));
          }}
        >
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  );
}

// ── Une ligne de projet, avec son historique dépliable ──────────────────────

function LigneProjet({
  ligne,
  token,
}: {
  ligne: InvestorSpace['lines'][number];
  token: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mouvements, setMouvements] = useState<InvestorMovement[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    const prochain = !ouvert;
    setOuvert(prochain);
    // On ne charge qu'à la première ouverture : replier puis déplier ne doit
    // pas relancer une requête pour des faits qui ne bougent pas.
    if (!prochain || mouvements !== null) return;
    try {
      const h = await api.getMyProjectHistory(token, ligne.financedProjectId);
      setMouvements(h.movements);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "L'historique n'a pas pu être lu.");
    }
  }

  return (
    <li className="project-item" style={{ cursor: 'default', marginBottom: '0.75rem' }}>
      <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
        <strong>{ligne.projectTitle}</strong>
        <span className="muted">{STATUTS[ligne.status] ?? ligne.status}</span>
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          margin: 0,
        }}
      >
        <Poste libelle="Investi" valeur={euros(ligne.investedCents)} />
        <Poste libelle="Récupéré" valeur={euros(ligne.repaidCents)} />
        <Poste libelle="Dividendes" valeur={euros(ligne.dividendsCents)} />
        <Poste
          libelle="Participation"
          valeur={ligne.shareBasisPoints === null ? '—' : pourcentage(ligne.shareBasisPoints)}
        />
      </dl>
      {ligne.shareNotice && (
        <p className="muted" style={{ margin: '0.5rem 0 0' }}>
          {ligne.shareNotice}
        </p>
      )}

      <button
        className="secondary"
        type="button"
        onClick={() => void basculer()}
        aria-expanded={ouvert}
        style={{ marginTop: '0.75rem' }}
      >
        {ouvert ? "Masquer l'historique" : "Voir l'historique"}
      </button>

      {ouvert && (
        <div style={{ marginTop: '0.75rem' }}>
          {erreur && <p className="error">{erreur}</p>}
          {!erreur && mouvements === null && <p className="loading">Chargement…</p>}
          {mouvements !== null && mouvements.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Aucun mouvement sur ce projet.
            </p>
          )}
          {mouvements !== null && mouvements.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...mouvements].reverse().map((m) => (
                <li
                  key={m.id}
                  className="top-bar"
                  style={{ marginBottom: '0.3rem', cursor: 'default', alignItems: 'baseline' }}
                >
                  <span>
                    <span className="muted">{jour(m.occurred_on)}</span>{' '}
                    {MOUVEMENTS[m.kind] ?? m.kind}
                    {m.reference && <span className="muted"> · {m.reference}</span>}
                    {m.corrects_movement_id && (
                      <span className="muted"> · rectifie une écriture antérieure</span>
                    )}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {euros(m.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ── Mes participations ──────────────────────────────────────────────────────

function Participations({ participations }: { participations: ParticipationRow[] }) {
  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Mes participations</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Chaque apport, à sa date, avec la part accordée <strong>ce jour-là</strong>. Ce n&apos;est
        pas la part d&apos;aujourd&apos;hui — celle-ci figure plus haut, projet par projet, et
        une dilution ultérieure n&apos;aurait pas modifié la ligne ci-dessous.
      </p>
      {participations.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Aucune participation enregistrée.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {participations.map((p) => (
            <li
              key={p.id}
              className="project-item"
              style={{ cursor: 'default', marginBottom: '0.5rem' }}
            >
              <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                <strong>
                  {p.financed_project?.project?.title ??
                    p.financed_project?.project_title ??
                    'Projet'}
                </strong>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {euros(p.invested_cents)}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {jour(p.occurred_on)} ·{' '}
                {p.share_basis_points_granted === null
                  ? 'aucune part accordée (prêt ou avance)'
                  : `${pourcentage(p.share_basis_points_granted)} accordés`}{' '}
                · {p.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        {libelle}
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '1.4rem', fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </p>
    </div>
  );
}

function Poste({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <dt className="muted" style={{ fontSize: 'var(--texte-etiquette)' }}>
        {libelle}
      </dt>
      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{valeur}</dd>
    </div>
  );
}
