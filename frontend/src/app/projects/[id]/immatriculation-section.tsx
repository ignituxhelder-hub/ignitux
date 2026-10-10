'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  OfflineReadError,
  type EtatCapitalImmatriculation,
  type EtatImmatriculation,
  type Registration,
} from '@/lib/api';
import { euros } from '@/lib/montants';

/** `AAAA-MM-JJ` → « JJ/MM/AAAA », sans passer par un fuseau horaire. */
function jourSaisi(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

const REPONSE_ILLISIBLE = 'Réponse inattendue du serveur.';

/** Même garde que le dossier de création : une réponse inattendue est un échec, pas « rien ». */
function estEtat(valeur: unknown): valeur is EtatImmatriculation {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return false;
  return 'registration' in valeur && 'suggestion' in valeur;
}

function estEtatCapital(valeur: unknown): valeur is EtatCapitalImmatriculation {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return false;
  const c = valeur as Partial<EtatCapitalImmatriculation>;
  return 'proposition' in c && typeof c.dejaEnregistree === 'boolean';
}

interface Saisie {
  siren: string;
  siret: string;
  vatNumber: string;
  legalName: string;
  headOffice: string;
  registeredOn: string;
}

const SAISIE_VIDE: Saisie = { siren: '', siret: '', vatNumber: '', legalName: '', headOffice: '', registeredOn: '' };

/** La saisie de départ : la fiche existante, sinon la suggestion (à confirmer), sinon rien. */
function saisieDepuis(etat: EtatImmatriculation): Saisie {
  const fiche = etat.registration;
  if (fiche) {
    return {
      siren: fiche.siren,
      siret: fiche.siret ?? '',
      vatNumber: fiche.vatNumber ?? '',
      legalName: fiche.legalName,
      headOffice: fiche.headOffice,
      registeredOn: fiche.registeredOn,
    };
  }
  return {
    ...SAISIE_VIDE,
    legalName: etat.suggestion?.legalName ?? '',
    headOffice: etat.suggestion?.headOffice ?? '',
  };
}

function messagesErreur(err: unknown, repli: string): string[] {
  if (err instanceof ApiError) return err.messages.length > 0 ? err.messages : [err.message];
  return [repli];
}

/**
 * IMMATRICULATION — rattacher le projet à l'entreprise créée.
 *
 * Tout ce qui est saisi ici vient de la personne (Kbis, avis de situation) :
 * Ignitux ne vérifie rien auprès de l'État, il contrôle seulement la forme
 * des numéros. Pas d'interface optimiste : on n'affiche que ce que le
 * serveur a enregistré. L'écriture de capital n'est jamais faite sans un
 * clic confirmé.
 */
export function ImmatriculationSection({
  token,
  projectId,
  onChanged,
}: {
  token: string;
  projectId: string;
  /** Prévenu quand la fiche est créée, remplacée ou supprimée (le dossier de création en dépend). */
  onChanged?: () => void;
}) {
  const cleChargement = projectId;
  const [etat, setEtat] = useState<EtatImmatriculation | null>(null);
  const [capital, setCapital] = useState<EtatCapitalImmatriculation | null>(null);
  const [capitalErreur, setCapitalErreur] = useState<string | null>(null);
  const [cleChargee, setCleChargee] = useState<string | null>(null);
  const [chargementEchoue, setChargementEchoue] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [succes, setSucces] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [modification, setModification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isLoading = cleChargee !== cleChargement;

  // Même garde que le dossier de création : une réponse plus ancienne qui
  // arrive après la plus récente est ignorée.
  const dernierChargement = useRef(0);
  const dernierCapital = useRef(0);

  const charger = useCallback(async () => {
    const numero = ++dernierChargement.current;
    // Un chargement complet rend caduque toute relecture du capital en cours.
    ++dernierCapital.current;
    const courant = () => numero === dernierChargement.current;
    setCleChargee(null);
    setChargementEchoue(false);
    try {
      const [recu, recuCapital] = await Promise.all([
        api.getImmatriculation(token, projectId),
        api.getCapitalImmatriculation(token, projectId),
      ]);
      if (!courant()) return;
      if (!estEtat(recu) || !estEtatCapital(recuCapital)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setEtat(recu);
      setCapital(recuCapital);
      setCapitalErreur(null);
      setSaisie(saisieDepuis(recu));
      setModification(false);
      setErreurs([]);
    } catch (err) {
      if (!courant()) return;
      // Hors ligne : une fiche en cache pourrait être périmée — on ne l'affiche pas.
      setEtat(null);
      setCapital(null);
      setChargementEchoue(true);
      setErreurs([
        err instanceof OfflineReadError
          ? 'Pas de réseau : la fiche d’immatriculation ne s’affiche pas hors ligne. Réessaie une fois la connexion revenue.'
          : err instanceof ApiError
            ? err.message
            : 'Impossible de charger la fiche d’immatriculation.',
      ]);
    } finally {
      if (courant()) setCleChargee(cleChargement);
    }
  }, [token, projectId, cleChargement]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Relit l'écriture de capital proposée après un changement de la fiche. */
  const rechargerCapital = useCallback(async () => {
    const numero = ++dernierCapital.current;
    const courant = () => numero === dernierCapital.current;
    try {
      const recu = await api.getCapitalImmatriculation(token, projectId);
      if (!courant()) return;
      if (!estEtatCapital(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setCapital(recu);
      setCapitalErreur(null);
    } catch (err) {
      if (!courant()) return;
      setCapital(null);
      setCapitalErreur(
        err instanceof ApiError && !(err instanceof OfflineReadError)
          ? err.message
          : 'Impossible de charger l’écriture de capital proposée.',
      );
    }
  }, [token, projectId]);

  const changer = (champ: keyof Saisie) => (e: { target: { value: string } }) =>
    setSaisie((s) => ({ ...s, [champ]: e.target.value }));

  const enregistrer = async () => {
    setErreurs([]);
    setSucces(null);
    setIsSaving(true);
    try {
      const facultatif = (v: string) => (v.trim() ? v.trim() : null);
      const recu = await api.enregistrerImmatriculation(token, projectId, {
        siren: saisie.siren.trim(),
        siret: facultatif(saisie.siret),
        vatNumber: facultatif(saisie.vatNumber),
        legalName: saisie.legalName.trim(),
        headOffice: saisie.headOffice.trim(),
        registeredOn: saisie.registeredOn,
      });
      if (!estEtat(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setEtat(recu);
      setSaisie(saisieDepuis(recu));
      setModification(false);
      setSucces('Fiche enregistrée.');
      onChanged?.();
      void rechargerCapital();
    } catch (err) {
      setErreurs(messagesErreur(err, 'Impossible d’enregistrer la fiche.'));
    } finally {
      setIsSaving(false);
    }
  };

  const supprimer = async () => {
    const accord = window.confirm(
      'Supprimer la fiche d’immatriculation ? Le projet repassera « non immatriculé ». ' +
        'Les devis et factures déjà émis ne changent pas.',
    );
    if (!accord) return;
    setErreurs([]);
    setSucces(null);
    setIsSaving(true);
    try {
      const recu = await api.supprimerImmatriculation(token, projectId);
      if (!estEtat(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setEtat(recu);
      setSaisie(saisieDepuis(recu));
      setModification(false);
      setSucces('Fiche supprimée.');
      onChanged?.();
      void rechargerCapital();
    } catch (err) {
      setErreurs(messagesErreur(err, 'Impossible de supprimer la fiche.'));
    } finally {
      setIsSaving(false);
    }
  };

  const enregistrerCapital = async () => {
    const proposition = capital?.proposition;
    if (!proposition) return;
    const accord = window.confirm(
      `Enregistrer dans ta comptabilité l’écriture « ${proposition.libelle} » du ${jourSaisi(proposition.date)} : ` +
        proposition.lignes
          .map((l) =>
            l.debitCents > 0
              ? `débit ${l.compte} ${l.libelleCompte} ${euros(l.debitCents)}`
              : `crédit ${l.compte} ${l.libelleCompte} ${euros(l.creditCents)}`,
          )
          .join(', ') +
        ' ? Elle ne sera enregistrée qu’une fois.',
    );
    if (!accord) return;
    setErreurs([]);
    setSucces(null);
    setIsSaving(true);
    try {
      const recu = await api.enregistrerCapitalImmatriculation(token, projectId);
      if (!estEtatCapital(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      ++dernierCapital.current;
      setCapital(recu);
      setCapitalErreur(null);
      // La fiche porte désormais l'écriture : elle ne peut plus être supprimée.
      setEtat((e) =>
        e?.registration ? { ...e, registration: { ...e.registration, capitalEntryId: recu.entryId } } : e,
      );
      setSucces('Écriture de capital enregistrée dans ta comptabilité.');
    } catch (err) {
      setErreurs(messagesErreur(err, 'Impossible d’enregistrer l’écriture de capital.'));
      // L'état réel du serveur, pas celui qu'on suppose (réservation, doublon…).
      void rechargerCapital();
    } finally {
      setIsSaving(false);
    }
  };

  const avis = (
    <p className="notice">
      Ces informations viennent de toi (Kbis, avis de situation). Ignitux ne les vérifie pas auprès de
      l&apos;État.
    </p>
  );

  const blocErreurs =
    erreurs.length === 0 ? null : erreurs.length === 1 ? (
      <p className="error" role="alert">
        {erreurs[0]}
      </p>
    ) : (
      <ul className="error" role="alert">
        {erreurs.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    );

  if (isLoading) {
    return (
      <div className="card" id="section-immatriculation">
        <h2>Immatriculation</h2>
        <p className="loading">Chargement…</p>
      </div>
    );
  }

  if (chargementEchoue || !etat) {
    return (
      <div className="card" id="section-immatriculation">
        <h2>Immatriculation</h2>
        {blocErreurs}
        <button className="secondary" type="button" onClick={() => void charger()}>
          Réessayer
        </button>
      </div>
    );
  }

  const fiche: Registration | null = etat.registration;
  const suggestion = fiche ? null : etat.suggestion;
  const montrerFormulaire = !fiche || modification;
  const proposeLegalName = !!suggestion && saisie.legalName === suggestion.legalName && suggestion.legalName !== '';
  const proposeHeadOffice = !!suggestion && saisie.headOffice === suggestion.headOffice && suggestion.headOffice !== '';

  return (
    <div className="card" id="section-immatriculation">
      <h2>Immatriculation</h2>
      {avis}
      {blocErreurs}
      {succes && (
        <p className="notice" role="status">
          {succes}
        </p>
      )}

      {fiche && !modification && (
        <>
          <p>
            <span className="pill pill--fire">
              <span aria-hidden="true">●</span> Immatriculée
            </span>{' '}
            le {jourSaisi(fiche.registeredOn)}.
          </p>
          <dl>
            <dt>SIREN</dt>
            <dd>{fiche.siren}</dd>
            <dt>SIRET du siège</dt>
            <dd>{fiche.siret ?? 'Non renseigné'}</dd>
            <dt>Numéro de TVA intracommunautaire</dt>
            <dd>{fiche.vatNumber ?? 'Non renseigné'}</dd>
            <dt>Dénomination</dt>
            <dd>{fiche.legalName}</dd>
            <dt>Siège</dt>
            <dd>{fiche.headOffice}</dd>
            <dt>Date d’immatriculation</dt>
            <dd>{jourSaisi(fiche.registeredOn)}</dd>
          </dl>
          <p className="muted">
            Les devis et factures émis après l’enregistrement de la fiche portent ces mentions ; ceux déjà émis ne
            changent pas.
          </p>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setSucces(null);
              setErreurs([]);
              setSaisie(saisieDepuis(etat));
              setModification(true);
            }}
            disabled={isSaving}
          >
            Modifier la fiche
          </button>{' '}
          {fiche.capitalEntryId ? (
            <p className="muted">
              Une écriture de capital a été enregistrée à partir de cette fiche : elle ne peut plus être supprimée,
              mais tu peux toujours la corriger.
            </p>
          ) : (
            <button className="secondary" type="button" onClick={() => void supprimer()} disabled={isSaving}>
              {isSaving ? 'Enregistrement…' : 'Supprimer la fiche'}
            </button>
          )}
        </>
      )}

      {montrerFormulaire && (
        <>
          {!fiche && (
            <p className="muted">
              Saisis ici le SIREN et les mentions de ton Kbis (ou de l’avis de situation INSEE) une fois ta société
              immatriculée.
            </p>
          )}
          {suggestion && (
            <p className="notice">
              Dénomination (titre du projet) et siège (statuts retenus) pré-remplis : à confirmer avec ton Kbis
              avant d’enregistrer.
            </p>
          )}
          <label htmlFor="immatriculation-siren">SIREN (9 chiffres, obligatoire)</label>
          <input
            id="immatriculation-siren"
            inputMode="numeric"
            autoComplete="off"
            aria-required="true"
            value={saisie.siren}
            maxLength={20}
            onChange={changer('siren')}
          />
          <label htmlFor="immatriculation-siret">SIRET du siège (14 chiffres, facultatif)</label>
          <input
            id="immatriculation-siret"
            inputMode="numeric"
            autoComplete="off"
            value={saisie.siret}
            maxLength={30}
            onChange={changer('siret')}
          />
          <label htmlFor="immatriculation-tva">Numéro de TVA intracommunautaire (facultatif)</label>
          <input
            id="immatriculation-tva"
            autoComplete="off"
            value={saisie.vatNumber}
            maxLength={30}
            onChange={changer('vatNumber')}
          />
          <label htmlFor="immatriculation-denomination">Dénomination (obligatoire)</label>
          <input
            id="immatriculation-denomination"
            aria-required="true"
            aria-describedby={proposeLegalName ? 'immatriculation-denomination-aide' : undefined}
            value={saisie.legalName}
            maxLength={200}
            onChange={changer('legalName')}
          />
          {proposeLegalName && (
            <p className="muted" id="immatriculation-denomination-aide">
              Proposé depuis le titre du projet — à confirmer.
            </p>
          )}
          <label htmlFor="immatriculation-siege">Adresse du siège (obligatoire)</label>
          <input
            id="immatriculation-siege"
            aria-required="true"
            aria-describedby={proposeHeadOffice ? 'immatriculation-siege-aide' : undefined}
            value={saisie.headOffice}
            maxLength={300}
            onChange={changer('headOffice')}
          />
          {proposeHeadOffice && (
            <p className="muted" id="immatriculation-siege-aide">
              Proposé depuis tes statuts retenus — à confirmer.
            </p>
          )}
          <label htmlFor="immatriculation-date">Date d’immatriculation (obligatoire)</label>
          <input
            id="immatriculation-date"
            type="date"
            aria-required="true"
            value={saisie.registeredOn}
            onChange={changer('registeredOn')}
          />
          <button className="primary" type="button" onClick={() => void enregistrer()} disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche'}
          </button>
          {fiche && (
            <>
              {' '}
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setErreurs([]);
                  setSaisie(saisieDepuis(etat));
                  setModification(false);
                }}
                disabled={isSaving}
              >
                Annuler
              </button>
            </>
          )}
        </>
      )}

      <h3>Écriture de capital</h3>
      {capitalErreur ? (
        <>
          <p className="error">{capitalErreur}</p>
          <button className="secondary" type="button" onClick={() => void rechargerCapital()}>
            Réessayer
          </button>
        </>
      ) : capital ? (
        <>
          {capital.dejaEnregistree && (
            <p>
              <span className="pill pill--fire">
                <span aria-hidden="true">✓</span> Déjà enregistrée
              </span>{' '}
              L’écriture de capital est déjà dans ta comptabilité.
            </p>
          )}
          {capital.proposition ? (
            <>
              <p>
                {capital.dejaEnregistree ? 'Écriture enregistrée' : 'Écriture proposée'} :{' '}
                {capital.proposition.libelle}, le {jourSaisi(capital.proposition.date)}, pour{' '}
                {euros(capital.proposition.montantCents)}.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <caption className="muted">Lignes de l’écriture</caption>
                  <thead>
                    <tr>
                      <th scope="col">Compte</th>
                      <th scope="col">Libellé</th>
                      <th scope="col">Débit</th>
                      <th scope="col">Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capital.proposition.lignes.map((ligne) => (
                      <tr key={ligne.compte}>
                        <td>{ligne.compte}</td>
                        <td>{ligne.libelleCompte}</td>
                        <td>{ligne.debitCents > 0 ? euros(ligne.debitCents) : '—'}</td>
                        <td>{ligne.creditCents > 0 ? euros(ligne.creditCents) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!capital.dejaEnregistree && (
                <>
                  <p className="muted">
                    Rien n’est écrit dans ta comptabilité sans ce clic, et une seule fois.
                  </p>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => void enregistrerCapital()}
                    disabled={isSaving}
                  >
                    Enregistrer cette écriture dans ma comptabilité
                  </button>
                </>
              )}
            </>
          ) : (
            capital.raison && <p className="muted">{capital.raison}</p>
          )}
        </>
      ) : null}
    </div>
  );
}
