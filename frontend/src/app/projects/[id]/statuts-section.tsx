'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type CompanyBylaws, type GenerateBylawsInput } from '@/lib/api';
import { centimesDepuisEuros } from '@/lib/montants';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [capital, setCapital] = useState('');
  const [headOffice, setHeadOffice] = useState('');
  const [durationYears, setDurationYears] = useState('99');
  const [associes, setAssocies] = useState<AssocieSaisie[]>([{ fullName: '', sharePercent: '100' }]);
  const [isGenerating, setIsGenerating] = useState(false);

  const aPersonneMorale = confirmedLegalForm ? FORMES_AVEC_PERSONNE_MORALE.has(confirmedLegalForm) : false;

  const charger = useCallback(async () => {
    if (!aPersonneMorale) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setBylaws(await api.getStatuts(token, projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les statuts.');
    } finally {
      setIsLoading(false);
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
      setBylaws(await api.genererStatuts(token, projectId, demande.dto));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La génération a échoué.');
    } finally {
      setIsGenerating(false);
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

      {confirmedLegalForm && aPersonneMorale && !bylaws && (
        <>
          <p className="notice">
            Ce qui suit est un brouillon à relire — jamais un document prêt à déposer sans contrôle.
          </p>
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
            {isGenerating ? 'Génération…' : 'Générer les statuts'}
          </button>
        </>
      )}
    </div>
  );
}
