'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type CompanyBylaws, type GenerateBylawsInput } from '@/lib/api';
import { centimesDepuisEuros, jour } from '@/lib/montants';

const FORMES = ['micro-entreprise', 'EI', 'EURL', 'SASU', 'SARL', 'SAS'] as const;
const FORMES_AVEC_PERSONNE_MORALE = new Set(['EURL', 'SASU', 'SARL', 'SAS']);
const TOTAL_BASIS_POINTS = 10000;

interface AssocieSaisie {
  id: number;
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

let prochainIdAssocie = 0;
/** Un identifiant stable par ligne : l'index ne l'est pas quand on en retire une. */
function nouvelAssocie(fullName = '', sharePercent = ''): AssocieSaisie {
  prochainIdAssocie += 1;
  return { id: prochainIdAssocie, fullName, sharePercent };
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
  onChanged,
}: {
  token: string;
  projectId: string;
  confirmedLegalForm: string | null;
  onFormConfirmed: (form: string) => void;
  /**
   * Appelé après une génération, une régénération, une rétention ou un déverrouillage réussi :
   * d'autres sections (le dossier de création) dépendent de l'état des statuts.
   */
  onChanged?: () => void;
}) {
  // Vide tant que rien n'est choisi : jamais une forme présélectionnée « au
  // hasard » — la personne confirme une décision, on ne la prend pas pour elle.
  const [formeChoisie, setFormeChoisie] = useState(confirmedLegalForm ?? '');
  const [changerForme, setChangerForme] = useState(false);
  // `bylaws` = la dernière version connue du serveur ; `texte` = ce qui est
  // dans la zone de saisie. Leur écart, c'est « modifications non enregistrées ».
  const [bylaws, setBylaws] = useState<CompanyBylaws | null>(null);
  const [texte, setTexte] = useState('');
  // Le projet pour lequel le chargement a abouti. Dérivé plutôt qu'un
  // booléen posé dans l'effet : quand la forme confirmée passe de « aucune »
  // à une société, le tout premier rendu doit déjà être « Chargement… », sinon
  // le formulaire de génération vide clignote avant que le chargement ne
  // démarre — et quelqu'un qui a déjà des statuts ne doit jamais le voir.
  const [projetCharge, setProjetCharge] = useState<string | null>(null);
  const [chargementEchoue, setChargementEchoue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capital, setCapital] = useState('');
  const [headOffice, setHeadOffice] = useState('');
  const [durationYears, setDurationYears] = useState('99');
  const [associes, setAssocies] = useState<AssocieSaisie[]>(() => [nouvelAssocie('', '100')]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetaining, setIsRetaining] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const aPersonneMorale = confirmedLegalForm ? FORMES_AVEC_PERSONNE_MORALE.has(confirmedLegalForm) : false;
  const isLoading = aPersonneMorale && projetCharge !== projectId;
  const isBusy = isGenerating || isSaving || isRetaining || isDownloading || isUnlocking;
  const modifie = bylaws !== null && texte !== bylaws.content;

  /** Toute réponse du serveur remplace l'état local ; `associates` n'est jamais supposé présent. */
  const recevoir = (recu: CompanyBylaws | null) => {
    setBylaws(recu ? { ...recu, associates: recu.associates ?? [] } : null);
    setTexte(recu?.content ?? '');
  };

  const charger = useCallback(async () => {
    if (!aPersonneMorale) return;
    // Un rechargement (nouveau jeton, nouveau projet) repasse par « Chargement… » :
    // jamais l'ancien contenu affiché comme s'il était celui qu'on attend.
    setProjetCharge(null);
    setChargementEchoue(false);
    try {
      const recu = await api.getStatuts(token, projectId);
      setBylaws(recu ? { ...recu, associates: recu.associates ?? [] } : null);
      setTexte(recu?.content ?? '');
      setError(null);
    } catch (err) {
      setChargementEchoue(true);
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les statuts.');
    } finally {
      setProjetCharge(projectId);
    }
  }, [token, projectId, aPersonneMorale]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const reessayer = () => {
    void charger();
  };

  // Sans forme confirmée : on propose la dernière recommandation de Former
  // (la plus récente d'abord), que la personne reste libre de changer.
  useEffect(() => {
    if (confirmedLegalForm) return;
    let annule = false;
    api
      .listLegalFormRecommendations(token, projectId)
      .then((recommandations) => {
        const forme = Array.isArray(recommandations) ? recommandations[0]?.recommended_form : undefined;
        if (!annule && forme && (FORMES as readonly string[]).includes(forme)) {
          setFormeChoisie((courante) => courante || forme);
        }
      })
      .catch(() => undefined); // un confort : sans lui, la personne choisit elle-même
    return () => {
      annule = true;
    };
  }, [token, projectId, confirmedLegalForm]);

  const confirmerForme = async () => {
    if (!formeChoisie) return;
    // Des statuts retenus sont verrouillés pour de bon : changer de forme les
    // laisse écrits pour une forme qui n'est plus la bonne. On le dit avant.
    if (bylaws?.status === 'retenue' && bylaws.legal_form !== formeChoisie) {
      const accord = window.confirm(
        `Tes statuts retenus sont écrits pour une ${bylaws.legal_form}. Si tu passes à ${formeChoisie}, ` +
          'ils ne correspondront plus à ta forme : il faudra les déverrouiller, les régénérer pour la ' +
          'nouvelle forme puis les retenir à nouveau.\n\n' +
          'Changer quand même de forme juridique ?',
      );
      if (!accord) return;
    }
    setError(null);
    try {
      await api.confirmerFormeJuridique(token, projectId, formeChoisie);
      setChangerForme(false);
      onFormConfirmed(formeChoisie);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de confirmer la forme juridique.');
    }
  };

  const ouvrirChangementForme = () => {
    setError(null);
    setFormeChoisie(confirmedLegalForm ?? '');
    setChangerForme(true);
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
        recevoir(await api.regenererStatuts(token, projectId, demande.dto));
        setIsRegenerating(false);
      } else {
        recevoir(await api.genererStatuts(token, projectId, demande.dto));
      }
      onChanged?.();
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
    const existants = bylaws.associates ?? [];
    setAssocies(
      existants.length > 0
        ? existants.map((a) => nouvelAssocie(a.full_name, saisieDepuisCentiemes(a.share_basis_points)))
        : [nouvelAssocie('', '100')],
    );
    setIsRegenerating(true);
  };

  const enregistrer = async () => {
    setError(null);
    setIsSaving(true);
    try {
      recevoir(await api.modifierStatuts(token, projectId, texte));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer les modifications.");
    } finally {
      setIsSaving(false);
    }
  };

  const retenir = async () => {
    // Verrouillant : on le dit, et on attend un accord explicite. Seul un
    // changement de forme juridique permet ensuite de déverrouiller.
    const accord = window.confirm(
      'Retenir cette version la verrouille : tu ne pourras plus ni la modifier ni la régénérer ' +
        '(sauf si tu changes ensuite de forme juridique).\n\n' +
        "Retenir n'est pas une validation juridique : fais relire le texte par un professionnel " +
        '(avocat, expert-comptable) avant tout dépôt. Continuer ?',
    );
    if (!accord) return;
    setError(null);
    setIsRetaining(true);
    try {
      recevoir(await api.retenirStatuts(token, projectId));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de retenir cette version.');
    } finally {
      setIsRetaining(false);
    }
  };

  /**
   * Seule sortie d'une version retenue : la forme confirmée a changé depuis.
   * Le serveur revérifie la condition (409 sinon).
   */
  const deverrouiller = async () => {
    if (!bylaws || !confirmedLegalForm) return;
    const accord = window.confirm(
      `Tes statuts retenus sont écrits pour une ${bylaws.legal_form}, ta forme est maintenant ${confirmedLegalForm}.\n\n` +
        'Les déverrouiller les remet en brouillon : tu pourras les régénérer pour ' +
        `${confirmedLegalForm}, puis il faudra les retenir à nouveau avant le dépôt. Continuer ?`,
    );
    if (!accord) return;
    setError(null);
    setIsUnlocking(true);
    try {
      recevoir(await api.deverrouillerStatuts(token, projectId));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de déverrouiller les statuts.');
    } finally {
      setIsUnlocking(false);
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

  const modifierAssocie = (id: number, changement: Partial<AssocieSaisie>) => {
    setAssocies((courants) => courants.map((a) => (a.id === id ? { ...a, ...changement } : a)));
  };

  if (isLoading) {
    return (
      <div className="card">
        <h2>Statuts</h2>
        <p className="loading">Chargement…</p>
      </div>
    );
  }

  const montrerChoixForme = !confirmedLegalForm || changerForme;

  return (
    <div className="card">
      <h2>Statuts</h2>
      {error && <p className="error">{error}</p>}

      {montrerChoixForme && (
        <>
          <p className="muted">
            {confirmedLegalForm
              ? 'Choisis la forme juridique à confirmer à la place de la forme actuelle.'
              : "Confirme d'abord la forme juridique retenue pour ce projet."}
          </p>
          <label htmlFor="statuts-forme">Forme juridique</label>
          <select
            id="statuts-forme"
            aria-label="Forme juridique"
            value={formeChoisie}
            onChange={(e) => setFormeChoisie(e.target.value)}
          >
            <option value="" disabled>
              Choisir une forme…
            </option>
            {FORMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button className="primary" type="button" onClick={confirmerForme} disabled={!formeChoisie}>
            Confirmer cette forme
          </button>
          {changerForme && (
            <button className="secondary" type="button" onClick={() => setChangerForme(false)}>
              Annuler
            </button>
          )}
        </>
      )}

      {confirmedLegalForm && !changerForme && (
        <p className="muted">
          Forme juridique confirmée : {confirmedLegalForm}.{' '}
          <button className="secondary" type="button" onClick={ouvrirChangementForme}>
            Modifier la forme
          </button>
        </p>
      )}

      {confirmedLegalForm && !aPersonneMorale && (
        <p className="muted">
          La micro-entreprise et l&apos;EI n&apos;ont pas de personne morale distincte à constituer :
          il n&apos;y a pas de statuts à générer pour cette forme.
        </p>
      )}

      {confirmedLegalForm && aPersonneMorale && chargementEchoue && (
        // Jamais le formulaire de génération ici : la génération écrase les
        // statuts existants, et on ne sait pas s'il y en a.
        <button className="secondary" type="button" onClick={reessayer}>
          Réessayer
        </button>
      )}

      {confirmedLegalForm && aPersonneMorale && !chargementEchoue && (!bylaws || isRegenerating) && (
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
            <div key={associe.id}>
              <label htmlFor={`statuts-associe-nom-${associe.id}`}>Nom de l&apos;associé {index + 1}</label>
              <input
                id={`statuts-associe-nom-${associe.id}`}
                aria-label={`Nom de l'associé ${index + 1}`}
                value={associe.fullName}
                onChange={(e) => modifierAssocie(associe.id, { fullName: e.target.value })}
              />
              <label htmlFor={`statuts-associe-part-${associe.id}`}>Part de l&apos;associé {index + 1} (%)</label>
              <input
                id={`statuts-associe-part-${associe.id}`}
                aria-label={`Part de l'associé ${index + 1} (%)`}
                value={associe.sharePercent}
                onChange={(e) => modifierAssocie(associe.id, { sharePercent: e.target.value })}
              />
              {associes.length > 1 && (
                <button
                  className="secondary"
                  type="button"
                  aria-label={`Retirer l'associé ${index + 1}`}
                  onClick={() => setAssocies((courants) => courants.filter((a) => a.id !== associe.id))}
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
          <button className="secondary" type="button" onClick={() => setAssocies([...associes, nouvelAssocie()])}>
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

      {confirmedLegalForm && aPersonneMorale && !chargementEchoue && bylaws && !isRegenerating && (
        <>
          {bylaws.status === 'brouillon' && (
            <p className="notice">
              Brouillon à relire — jamais un document prêt à déposer sans contrôle.
            </p>
          )}
          {/* Dans les deux états : « retenue » veut dire choisie, pas validée juridiquement. */}
          <p className="notice">
            Texte généré par IA : il ne remplace pas la relecture par un professionnel (avocat,
            expert-comptable) avant tout dépôt.
          </p>
          {bylaws.legal_form !== confirmedLegalForm && (
            <p className="error">
              Ce texte a été généré pour « {bylaws.legal_form} », mais la forme confirmée sur ce
              projet est maintenant « {confirmedLegalForm} ».{' '}
              {bylaws.status === 'retenue'
                ? 'Cette version retenue est verrouillée, mais elle doit correspondre à ta forme pour le dépôt : ' +
                  `tu peux déverrouiller pour les réécrire pour ${confirmedLegalForm}. Tes statuts repasseront en ` +
                  'brouillon, tu les régénéreras, puis tu les retiendras à nouveau.'
                : "Le contenu n'a pas suivi ce changement automatiquement — régénère si tu veux qu'il corresponde à la forme actuelle."}
            </p>
          )}
          {bylaws.status === 'retenue' && bylaws.legal_form !== confirmedLegalForm && (
            <button className="primary" type="button" onClick={deverrouiller} disabled={isBusy}>
              {isUnlocking ? 'Déverrouillage…' : 'Déverrouiller pour réécrire mes statuts'}
            </button>
          )}
          <label htmlFor="statuts-texte">Texte des statuts</label>
          <textarea
            id="statuts-texte"
            aria-label="Texte des statuts"
            value={texte}
            readOnly={bylaws.status === 'retenue'}
            onChange={(e) => setTexte(e.target.value)}
            rows={20}
            style={{ width: '100%' }}
          />
          {modifie && <p className="notice">Modifications non enregistrées</p>}
          {bylaws.status === 'brouillon' && (
            <>
              <button className="secondary" type="button" onClick={enregistrer} disabled={isBusy}>
                {isSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
              <button className="secondary" type="button" onClick={ouvrirRegeneration} disabled={isBusy}>
                Régénérer
              </button>
              <button className="primary" type="button" onClick={retenir} disabled={isBusy || modifie}>
                {isRetaining ? 'Enregistrement…' : 'Retenir cette version'}
              </button>
            </>
          )}
          {bylaws.status === 'retenue' && <p className="muted">Version retenue le {jour(bylaws.finalized_at)}</p>}
          <button className="secondary" type="button" onClick={telecharger} disabled={isBusy || modifie}>
            {isDownloading ? 'Téléchargement…' : 'Télécharger en PDF'}
          </button>
        </>
      )}
    </div>
  );
}
