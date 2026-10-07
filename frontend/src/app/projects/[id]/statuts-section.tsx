'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type CompanyBylaws, type GenerateBylawsInput } from '@/lib/api';
import { centimesDepuisEuros, jour } from '@/lib/montants';

const FORMES = ['micro-entreprise', 'EI', 'EURL', 'SASU', 'SARL', 'SAS'] as const;
const FORMES_AVEC_PERSONNE_MORALE = new Set(['EURL', 'SASU', 'SARL', 'SAS']);
const TOTAL_BASIS_POINTS = 10000;

interface AssocieSaisie {
  fullName: string;
  sharePercent: string;
}

/**
 * Valide la saisie et la convertit en corps de requête, ou rend le message
 * français à montrer. Le serveur revalide tout : ceci évite seulement un
 * aller-retour pour une erreur que la personne peut corriger tout de suite.
 */
function construireDemande(saisie: {
  capital: string;
  headOffice: string;
  durationYears: string;
  associes: AssocieSaisie[];
}): { dto: GenerateBylawsInput } | { erreur: string } {
  const capitalCents = centimesDepuisEuros(saisie.capital);
  if (capitalCents === null || capitalCents <= 0) {
    return { erreur: 'Le capital social doit être un montant en euros strictement positif.' };
  }
  if (!saisie.headOffice.trim()) return { erreur: 'Indique le siège social.' };

  const durationYears = Number(saisie.durationYears);
  if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 99) {
    return { erreur: 'La durée de la société doit être un nombre entier d’années entre 1 et 99.' };
  }

  const associates: GenerateBylawsInput['associates'] = [];
  for (const [index, associe] of saisie.associes.entries()) {
    if (!associe.fullName.trim()) return { erreur: `Indique le nom de l’associé ${index + 1}.` };
    // Un pourcentage saisi « 33,33 » vaut 3333 points de base : même
    // conversion x100 que les euros en centimes.
    const shareBasisPoints = centimesDepuisEuros(associe.sharePercent);
    if (shareBasisPoints === null || shareBasisPoints < 1 || shareBasisPoints > TOTAL_BASIS_POINTS) {
      return { erreur: `La part de l’associé ${index + 1} doit être un pourcentage entre 0 et 100.` };
    }
    associates.push({ fullName: associe.fullName.trim(), shareBasisPoints });
  }

  const total = associates.reduce((somme, a) => somme + a.shareBasisPoints, 0);
  if (total !== TOTAL_BASIS_POINTS) {
    return { erreur: 'Les parts des associés doivent totaliser exactement 100 %.' };
  }

  return { dto: { capitalCents, headOffice: saisie.headOffice.trim(), durationYears, associates } };
}

/** Centimes ou points de base → saisie française (« 1000 », « 33,33 »). */
function saisieDepuisCentiemes(valeur: number): string {
  const unites = valeur / 100;
  return Number.isInteger(unites) ? String(unites) : unites.toFixed(2).replace('.', ',');
}

/**
 * STATUTS — brouillon à relire, jamais un document prêt à déposer sans
 * contrôle. Même principe que Former et que le mandat : une aide, pas une
 * décision prise à la place de la personne.
 */
export function StatutsSection({
  token,
  projectId,
  confirmedLegalForm,
  onFormConfirmed,
}: {
  token: string;
  projectId: string;
  confirmedLegalForm: string | null;
  onFormConfirmed: (form: string) => void;
}) {
  const [formeChoisie, setFormeChoisie] = useState(confirmedLegalForm ?? 'micro-entreprise');
  const [bylaws, setBylaws] = useState<CompanyBylaws | null>(null);
  // Le projet pour lequel le chargement a abouti. Dérivé plutôt qu'un
  // booléen posé dans l'effet : quand la forme confirmée passe de « aucune »
  // à une société, le tout premier rendu doit déjà être « Chargement… », sinon
  // le formulaire de génération vide clignote avant que le chargement ne
  // démarre — et quelqu'un qui a déjà des statuts ne doit jamais le voir.
  const [projetCharge, setProjetCharge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [capital, setCapital] = useState('');
  const [headOffice, setHeadOffice] = useState('');
  const [durationYears, setDurationYears] = useState('99');
  const [associes, setAssocies] = useState<AssocieSaisie[]>([{ fullName: '', sharePercent: '100' }]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetaining, setIsRetaining] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const aPersonneMorale = confirmedLegalForm ? FORMES_AVEC_PERSONNE_MORALE.has(confirmedLegalForm) : false;
  const isLoading = aPersonneMorale && projetCharge !== projectId;
  const isBusy = isGenerating || isSaving || isRetaining || isDownloading;

  const charger = useCallback(async () => {
    if (!aPersonneMorale) return;
    try {
      setBylaws(await api.getStatuts(token, projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les statuts.');
    } finally {
      setProjetCharge(projectId);
    }
  }, [token, projectId, aPersonneMorale]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const confirmerForme = async () => {
    setError(null);
    try {
      await api.confirmerFormeJuridique(token, projectId, formeChoisie);
      onFormConfirmed(formeChoisie);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de confirmer la forme juridique.');
    }
  };

  const genererStatuts = async () => {
    setError(null);
    const demande = construireDemande({ capital, headOffice, durationYears, associes });
    if ('erreur' in demande) {
      setError(demande.erreur);
      return;
    }
    setIsGenerating(true);
    try {
      if (isRegenerating) {
        setBylaws(await api.regenererStatuts(token, projectId, demande.dto));
        setIsRegenerating(false);
      } else {
        setBylaws(await api.genererStatuts(token, projectId, demande.dto));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La génération a échoué.');
    } finally {
      setIsGenerating(false);
    }
  };

  /** Rouvre le formulaire, prérempli avec les données des statuts actuels. */
  const ouvrirRegeneration = () => {
    if (!bylaws) return;
    setError(null);
    setCapital(saisieDepuisCentiemes(bylaws.capital_cents));
    setHeadOffice(bylaws.head_office);
    setDurationYears(String(bylaws.duration_years));
    setAssocies(
      bylaws.associates.length > 0
        ? bylaws.associates.map((a) => ({
            fullName: a.full_name,
            sharePercent: saisieDepuisCentiemes(a.share_basis_points),
          }))
        : [{ fullName: '', sharePercent: '100' }],
    );
    setIsRegenerating(true);
  };

  const enregistrer = async () => {
    if (!bylaws) return;
    setError(null);
    setIsSaving(true);
    try {
      setBylaws(await api.modifierStatuts(token, projectId, bylaws.content));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer les modifications.");
    } finally {
      setIsSaving(false);
    }
  };

  const retenir = async () => {
    setError(null);
    setIsRetaining(true);
    try {
      setBylaws(await api.retenirStatuts(token, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de retenir cette version.');
    } finally {
      setIsRetaining(false);
    }
  };

  const telecharger = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      const blob = await api.telechargerStatutsPdf(token, projectId);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'statuts.pdf';
      lien.click();
      // Pas de révocation synchrone : certains navigateurs n'ont pas encore
      // démarré le téléchargement quand le clic revient.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de télécharger le PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const modifierAssocie = (index: number, changement: Partial<AssocieSaisie>) => {
    setAssocies((courants) => courants.map((a, i) => (i === index ? { ...a, ...changement } : a)));
  };

  if (isLoading) {
    return (
      <div className="card">
        <h2>Statuts</h2>
        <p className="loading">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Statuts</h2>
      {error && <p className="error">{error}</p>}

      {!confirmedLegalForm && (
        <>
          <p className="muted">Confirme d&apos;abord la forme juridique retenue pour ce projet.</p>
          <label htmlFor="statuts-forme">Forme juridique</label>
          <select
            id="statuts-forme"
            aria-label="Forme juridique"
            value={formeChoisie}
            onChange={(e) => setFormeChoisie(e.target.value)}
          >
            {FORMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button className="primary" type="button" onClick={confirmerForme}>
            Confirmer cette forme
          </button>
        </>
      )}

      {confirmedLegalForm && !aPersonneMorale && (
        <p className="muted">
          La micro-entreprise et l&apos;EI n&apos;ont pas de personne morale distincte à constituer :
          il n&apos;y a pas de statuts à générer pour cette forme.
        </p>
      )}

      {confirmedLegalForm && aPersonneMorale && (!bylaws || isRegenerating) && (
        <>
          <p className="notice">
            Ce qui suit est un brouillon à relire — jamais un document prêt à déposer sans contrôle.
          </p>
          {isRegenerating && (
            <p className="error">
              Attention : régénérer remplace le texte actuel. Les modifications que tu y as faites à
              la main seront perdues.
            </p>
          )}
          <label htmlFor="statuts-capital">Capital social (€)</label>
          <input
            id="statuts-capital"
            aria-label="Capital social (€)"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
          />
          <label htmlFor="statuts-siege">Siège social</label>
          <input
            id="statuts-siege"
            aria-label="Siège social"
            value={headOffice}
            onChange={(e) => setHeadOffice(e.target.value)}
          />
          <label htmlFor="statuts-duree">Durée de la société (années)</label>
          <input
            id="statuts-duree"
            aria-label="Durée de la société (années)"
            value={durationYears}
            onChange={(e) => setDurationYears(e.target.value)}
          />
          {associes.map((associe, index) => (
            <div key={index}>
              <label htmlFor={`statuts-associe-nom-${index}`}>Nom de l&apos;associé {index + 1}</label>
              <input
                id={`statuts-associe-nom-${index}`}
                aria-label={`Nom de l'associé ${index + 1}`}
                value={associe.fullName}
                onChange={(e) => modifierAssocie(index, { fullName: e.target.value })}
              />
              <label htmlFor={`statuts-associe-part-${index}`}>Part de l&apos;associé {index + 1} (%)</label>
              <input
                id={`statuts-associe-part-${index}`}
                aria-label={`Part de l'associé ${index + 1} (%)`}
                value={associe.sharePercent}
                onChange={(e) => modifierAssocie(index, { sharePercent: e.target.value })}
              />
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            onClick={() => setAssocies([...associes, { fullName: '', sharePercent: '' }])}
          >
            Ajouter un associé
          </button>
          <button className="primary" type="button" onClick={genererStatuts} disabled={isGenerating}>
            {isGenerating ? 'Génération…' : isRegenerating ? 'Régénérer les statuts' : 'Générer les statuts'}
          </button>
          {isRegenerating && (
            <button className="secondary" type="button" onClick={() => setIsRegenerating(false)} disabled={isGenerating}>
              Annuler
            </button>
          )}
        </>
      )}

      {confirmedLegalForm && aPersonneMorale && bylaws && !isRegenerating && (
        <>
          {bylaws.status === 'brouillon' && (
            <p className="notice">
              Brouillon à relire — jamais un document prêt à déposer sans contrôle.
            </p>
          )}
          {bylaws.legal_form !== confirmedLegalForm && (
            <p className="error">
              Ce texte a été généré pour « {bylaws.legal_form} », mais la forme confirmée sur ce
              projet est maintenant « {confirmedLegalForm} ». Le contenu n&apos;a pas suivi ce
              changement automatiquement — régénère si tu veux qu&apos;il corresponde à la forme
              actuelle.
            </p>
          )}
          <label htmlFor="statuts-texte">Texte des statuts</label>
          <textarea
            id="statuts-texte"
            aria-label="Texte des statuts"
            value={bylaws.content}
            readOnly={bylaws.status === 'retenue'}
            onChange={(e) => setBylaws({ ...bylaws, content: e.target.value })}
            rows={20}
            style={{ width: '100%' }}
          />
          {bylaws.status === 'brouillon' && (
            <>
              <button className="secondary" type="button" onClick={enregistrer} disabled={isBusy}>
                {isSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
              <button className="secondary" type="button" onClick={ouvrirRegeneration} disabled={isBusy}>
                Régénérer
              </button>
              <button className="primary" type="button" onClick={retenir} disabled={isBusy}>
                {isRetaining ? 'Enregistrement…' : 'Retenir cette version'}
              </button>
            </>
          )}
          {bylaws.status === 'retenue' && <p className="muted">Version retenue le {jour(bylaws.finalized_at)}</p>}
          <button className="secondary" type="button" onClick={telecharger} disabled={isBusy}>
            {isDownloading ? 'Téléchargement…' : 'Télécharger en PDF'}
          </button>
        </>
      )}
    </div>
  );
}
