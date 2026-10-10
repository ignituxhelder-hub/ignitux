'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, OfflineReadError, type DossierCreation, type EtatPieceDossier } from '@/lib/api';

const REFERENCE_MAX = 100;

/**
 * Jour du dépôt à l'heure de Paris — exactement comme le récapitulatif PDF
 * (backend, Europe/Paris), quel que soit le fuseau de l'appareil.
 */
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function jourParis(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FORMAT_JOUR_PARIS.format(d);
}

/** L'état de chaque pièce se lit en toutes lettres : jamais la couleur seule. */
const LIBELLE_ETAT: Record<EtatPieceDossier, string> = {
  pret: 'Prêt',
  a_faire: 'À faire',
  non_concerne: 'Non concerné',
};

/**
 * Une réponse inattendue (corps vide, tableau, ancien format) ne doit jamais
 * produire une section vide qui ressemble à « rien à faire » : on la traite
 * comme un échec de chargement.
 */
function estDossier(valeur: unknown): valeur is DossierCreation {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return false;
  const d = valeur as Partial<DossierCreation>;
  return (
    Array.isArray(d.pieces) &&
    Array.isArray(d.etapes) &&
    typeof d.frais === 'object' &&
    d.frais !== null &&
    typeof d.filing === 'object' &&
    d.filing !== null &&
    Array.isArray(d.filing.checkedItems)
  );
}

const REPONSE_ILLISIBLE = 'Réponse inattendue du serveur.';

/**
 * DOSSIER DE CRÉATION — préparer le dépôt, sans déposer.
 *
 * Ignitux rassemble les pièces et explique le dépôt ; c'est la personne qui
 * dépose sur le guichet unique. Rien n'est payé ni déposé par Ignitux. Pas
 * d'interface optimiste : chaque case cochée et chaque changement d'état
 * affichent la réponse du serveur, jamais ce qu'on espère qu'il a enregistré.
 */
export function DossierCreationSection({
  token,
  projectId,
  confirmedLegalForm,
  refreshSignal = 0,
}: {
  token: string;
  projectId: string;
  /** Sert à recharger quand la forme change : les pièces en dépendent. */
  confirmedLegalForm: string | null;
  /** Incrémenté quand les statuts changent (section Statuts) : la pièce « statuts » en dépend. */
  refreshSignal?: number;
}) {
  const cleChargement = `${projectId}|${confirmedLegalForm ?? ''}|${refreshSignal}`;
  const [dossier, setDossier] = useState<DossierCreation | null>(null);
  // Dérivé plutôt qu'un booléen posé dans l'effet (même raison que les
  // statuts) : le premier rendu après un changement est déjà « Chargement… ».
  const [cleChargee, setCleChargee] = useState<string | null>(null);
  const [chargementEchoue, setChargementEchoue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isLoading = cleChargee !== cleChargement;
  const isBusy = isSaving || isDownloading;

  // Numéro du dernier chargement lancé : une réponse plus ancienne qui
  // arrive après (changement de forme, rechargement rapide) est ignorée,
  // sinon elle écraserait le dossier à jour par un dossier périmé.
  const dernierChargement = useRef(0);

  const charger = useCallback(async () => {
    const numero = ++dernierChargement.current;
    const courant = () => numero === dernierChargement.current;
    setCleChargee(null);
    setChargementEchoue(false);
    try {
      const recu = await api.getDossierCreation(token, projectId);
      if (!courant()) return;
      if (!estDossier(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setDossier(recu);
      setError(null);
    } catch (err) {
      if (!courant()) return;
      // Hors ligne, l'API lève OfflineReadError avec une copie en cache :
      // on ne l'affiche pas (des cases et un dépôt périmés seraient pris
      // pour l'état réel) — on montre l'échec et « Réessayer ».
      setDossier(null);
      setChargementEchoue(true);
      setError(
        err instanceof OfflineReadError
          ? 'Pas de réseau : le dossier ne s’affiche pas hors ligne. Réessaie une fois la connexion revenue.'
          : err instanceof ApiError
            ? err.message
            : 'Impossible de charger le dossier de création.',
      );
    } finally {
      if (courant()) setCleChargee(cleChargement);
    }
  }, [token, projectId, cleChargement]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Envoie une écriture et n'affiche que ce que le serveur renvoie. */
  const ecrire = async (appel: () => Promise<DossierCreation>, messageEchec: string) => {
    setError(null);
    setIsSaving(true);
    try {
      const recu = await appel();
      if (!estDossier(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setDossier(recu);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : messageEchec);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const basculerPiece = (pieceId: string, coche: boolean) => {
    if (!dossier) return;
    // Seulement les pièces cochables aujourd'hui : une case restée d'une
    // ancienne forme (capital_depose après SAS → micro-entreprise) ferait
    // refuser tout l'envoi par le serveur et verrouillerait les cases.
    const cochables = new Set(dossier.pieces.filter((p) => p.cochable).map((p) => p.id));
    const courantes = dossier.filing.checkedItems.filter((id) => cochables.has(id));
    const nouvelles = coche ? [...courantes.filter((id) => id !== pieceId), pieceId] : courantes.filter((id) => id !== pieceId);
    void ecrire(() => api.cocherPiecesDossier(token, projectId, nouvelles), "Impossible d'enregistrer la pièce.");
  };

  const marquerDepose = async () => {
    const ref = reference.trim();
    const ok = await ecrire(
      () => api.marquerDossierDepose(token, projectId, ref || undefined),
      'Impossible de marquer le dossier comme déposé.',
    );
    if (ok) setReference('');
  };

  const rouvrir = () => {
    void ecrire(() => api.rouvrirDossier(token, projectId), 'Impossible de rouvrir le dossier.');
  };

  const telecharger = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      const blob = await api.telechargerDossierPdf(token, projectId);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'dossier-de-creation.pdf';
      lien.click();
      // Pas de révocation synchrone : certains navigateurs n'ont pas encore
      // démarré le téléchargement quand le clic revient.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de télécharger le récapitulatif.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <h2>Dossier de création</h2>
        <p className="loading">Chargement…</p>
      </div>
    );
  }

  const avis = (
    <p className="notice">
      Ignitux prépare ton dossier ; c&apos;est toi qui le déposes sur le guichet unique. Rien
      n&apos;est payé ni déposé par Ignitux. Aide à la préparation, pas un conseil juridique.
    </p>
  );

  if (chargementEchoue || !dossier) {
    // Jamais une liste vide ici : elle laisserait croire qu'il n'y a rien à préparer.
    return (
      <div className="card">
        <h2>Dossier de création</h2>
        {error && <p className="error">{error}</p>}
        <button className="secondary" type="button" onClick={() => void charger()}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!dossier.forme) {
    return (
      <div className="card">
        <h2>Dossier de création</h2>
        {avis}
        <p className="muted">
          Confirme d&apos;abord la forme juridique (section Statuts ci-dessus) : les pièces du
          dossier en dépendent.
        </p>
      </div>
    );
  }

  const { filing } = dossier;
  const depose = filing.status === 'depose';

  return (
    <div className="card">
      <h2>Dossier de création</h2>
      {avis}
      {error && <p className="error">{error}</p>}
      {dossier.immatriculee && dossier.registration ? (
        <p>
          <span className="pill pill--fire">
            <span aria-hidden="true">✓</span> Immatriculée le {jourParis(dossier.registration.registeredOn)} — SIREN{' '}
            {dossier.registration.siren}
          </span>{' '}
          <a href="#section-immatriculation">Voir la fiche d’immatriculation</a>
        </p>
      ) : (
        <p className="muted">
          Pas encore immatriculée. Saisis ton SIREN dans la section{' '}
          <a href="#section-immatriculation">Immatriculation</a> quand tu l&apos;as reçu.
        </p>
      )}
      <p className="muted">Forme juridique : {dossier.forme}.</p>

      <h3>Pièces du dossier</h3>
      <ul>
        {dossier.pieces.map((piece) => (
          <li key={piece.id}>
            {piece.cochable ? (
              <>
                <input
                  type="checkbox"
                  id={`dossier-piece-${piece.id}`}
                  checked={filing.checkedItems.includes(piece.id)}
                  disabled={isBusy}
                  onChange={(e) => basculerPiece(piece.id, e.target.checked)}
                />{' '}
                <label htmlFor={`dossier-piece-${piece.id}`}>{piece.titre}</label>
              </>
            ) : (
              <strong>{piece.titre}</strong>
            )}{' '}
            <span className={piece.etat === 'pret' ? 'pill pill--fire' : 'pill'}>
              <span aria-hidden="true">{piece.etat === 'pret' ? '●' : '○'}</span> {LIBELLE_ETAT[piece.etat]}
            </span>
            {piece.detail && <p className="muted">{piece.detail}</p>}
          </li>
        ))}
      </ul>

      <h3>Déposer pas à pas</h3>
      <ol>
        {dossier.etapes.map((etape) => (
          <li key={etape.id}>
            <strong>{etape.titre}</strong>
            <p>{etape.texte}</p>
            {etape.lien && (
              <a href={etape.lien} target="_blank" rel="noopener noreferrer">
                {etape.lienLibelle || etape.lien} (nouvel onglet)
              </a>
            )}
          </li>
        ))}
      </ol>

      <h3>Frais à prévoir</h3>
      <ul>
        {dossier.frais.lignes.map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>
      <p className="notice">{dossier.frais.avertissement}</p>
      {dossier.frais.sources.length > 0 && (
        <p className="muted">
          Sources officielles :{' '}
          {dossier.frais.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 && ' · '}
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.libelle} (nouvel onglet)
              </a>
            </span>
          ))}
        </p>
      )}

      <button className="secondary" type="button" onClick={telecharger} disabled={isBusy}>
        {isDownloading ? 'Téléchargement…' : 'Télécharger le récapitulatif (PDF)'}
      </button>

      <h3>Dépôt</h3>
      {depose ? (
        <>
          <p>
            Dossier marqué comme déposé le {jourParis(filing.depositedAt)}.
            {filing.filingReference && <> Référence : {filing.filingReference}.</>}
          </p>
          <button className="secondary" type="button" onClick={rouvrir} disabled={isBusy}>
            {isSaving ? 'Enregistrement…' : 'Rouvrir'}
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Une fois ton dossier déposé sur le guichet unique, note-le ici. Ignitux ne vérifie pas le
            dépôt : c&apos;est ta déclaration.
          </p>
          <label htmlFor="dossier-reference">Référence du dépôt (facultatif)</label>
          <input
            id="dossier-reference"
            value={reference}
            maxLength={REFERENCE_MAX}
            onChange={(e) => setReference(e.target.value)}
          />
          <button className="primary" type="button" onClick={marquerDepose} disabled={isBusy}>
            {isSaving ? 'Enregistrement…' : 'Marquer comme déposé'}
          </button>
        </>
      )}
    </div>
  );
}
