'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  OfflineReadError,
  type EtatCapitalImmatriculation,
  type EtatImmatriculation,
  type LigneEcritureCapital,
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

type Champ = keyof Saisie;

const SAISIE_VIDE: Saisie = { siren: '', siret: '', vatNumber: '', legalName: '', headOffice: '', registeredOn: '' };

/** L'identifiant de chaque champ (id/htmlFor), et de son message d'erreur. */
const ID_CHAMP: Record<Champ, string> = {
  siren: 'immatriculation-siren',
  siret: 'immatriculation-siret',
  vatNumber: 'immatriculation-tva',
  legalName: 'immatriculation-denomination',
  headOffice: 'immatriculation-siege',
  registeredOn: 'immatriculation-date',
};

const ORDRE_CHAMPS: Champ[] = ['siren', 'siret', 'vatNumber', 'legalName', 'headOffice', 'registeredOn'];

/** Les champs obligatoires, vérifiés avant tout envoi (jamais de date vide envoyée). */
const OBLIGATOIRES: Array<[Champ, string]> = [
  ['siren', 'Le SIREN est obligatoire.'],
  ['legalName', 'La dénomination est obligatoire.'],
  ['headOffice', 'L’adresse du siège est obligatoire.'],
  ['registeredOn', 'La date d’immatriculation est obligatoire.'],
];

/**
 * Le champ qu'un message du serveur désigne, quand il en désigne un. L'ordre
 * compte : un message sur la TVA ou le SIRET parle aussi du SIREN.
 */
function champDuMessage(message: string): Champ | null {
  if (/\bTVA\b/.test(message)) return 'vatNumber';
  if (/\bSIRET\b/.test(message)) return 'siret';
  if (/\bSIREN\b/.test(message)) return 'siren';
  if (/dénomination/i.test(message)) return 'legalName';
  if (/siège/i.test(message)) return 'headOffice';
  if (/date d[’']immatriculation/i.test(message)) return 'registeredOn';
  return null;
}

type ErreursChamps = Partial<Record<Champ, string[]>>;

function repartir(messages: string[]): { champs: ErreursChamps; autres: string[] } {
  const champs: ErreursChamps = {};
  const autres: string[] = [];
  for (const message of messages) {
    const champ = champDuMessage(message);
    if (champ) champs[champ] = [...(champs[champ] ?? []), message];
    else autres.push(message);
  }
  return { champs, autres };
}

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

function TableEcriture({ lignes }: { lignes: LigneEcritureCapital[] }) {
  return (
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
          {lignes.map((ligne) => (
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
  );
}

/**
 * IMMATRICULATION — rattacher le projet à l'entreprise créée.
 *
 * Tout ce qui est saisi ici vient de la personne (Kbis, avis de situation) :
 * Ignitux ne vérifie rien auprès de l'État, il contrôle seulement la forme
 * des numéros. Pas d'interface optimiste : on n'affiche que ce que le
 * serveur a enregistré. L'écriture de capital n'est jamais faite sans un
 * clic confirmé, et le serveur refuse si ce qui a été montré a changé.
 *
 * La fiche et l'écriture de capital se chargent séparément : un échec du
 * second ne cache jamais la fiche.
 */
export function ImmatriculationSection({
  token,
  projectId,
  confirmedLegalForm = null,
  refreshSignal = 0,
  onChanged,
}: {
  token: string;
  projectId: string;
  /** Sert à recharger quand la forme change : la proposition de capital en dépend. */
  confirmedLegalForm?: string | null;
  /** Incrémenté quand les statuts changent : la suggestion et le capital en dépendent. */
  refreshSignal?: number;
  /** Prévenu quand la fiche est créée, remplacée ou supprimée (le dossier de création en dépend). */
  onChanged?: () => void;
}) {
  const cleChargement = `${projectId}|${confirmedLegalForm ?? ''}|${refreshSignal}`;
  const [etat, setEtat] = useState<EtatImmatriculation | null>(null);
  const [cleChargee, setCleChargee] = useState<string | null>(null);
  const [chargementEchoue, setChargementEchoue] = useState(false);
  const [capital, setCapital] = useState<EtatCapitalImmatriculation | null>(null);
  const [capitalCleChargee, setCapitalCleChargee] = useState<string | null>(null);
  const [capitalErreur, setCapitalErreur] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [erreursChamps, setErreursChamps] = useState<ErreursChamps>({});
  const [succes, setSucces] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [modification, setModification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isLoading = cleChargee !== cleChargement;
  const capitalEnChargement = capitalCleChargee !== cleChargement && !capitalErreur;

  // Même garde que le dossier de création : une réponse plus ancienne qui
  // arrive après la plus récente est ignorée.
  const dernierChargement = useRef(0);
  const dernierCapital = useRef(0);
  // Une saisie commencée n'est pas écrasée par un rechargement venu d'une
  // autre section (statuts, forme) sur le même projet.
  const saisieTouchee = useRef<string | null>(null);

  const charger = useCallback(async () => {
    const numero = ++dernierChargement.current;
    const courant = () => numero === dernierChargement.current;
    setCleChargee(null);
    setChargementEchoue(false);
    try {
      const recu = await api.getImmatriculation(token, projectId);
      if (!courant()) return;
      if (!estEtat(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setEtat(recu);
      if (saisieTouchee.current !== projectId) {
        saisieTouchee.current = null;
        setSaisie(saisieDepuis(recu));
        setModification(false);
        setErreursChamps({});
      }
      setErreurs([]);
    } catch (err) {
      if (!courant()) return;
      // Hors ligne : une fiche en cache pourrait être périmée — on ne l'affiche pas.
      setEtat(null);
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

  /** Lit l'état de l'écriture de capital — indépendamment de la fiche. */
  const chargerCapital = useCallback(async () => {
    const numero = ++dernierCapital.current;
    const courant = () => numero === dernierCapital.current;
    setCapitalErreur(null);
    try {
      const recu = await api.getCapitalImmatriculation(token, projectId);
      if (!courant()) return;
      if (!estEtatCapital(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      setCapital(recu);
    } catch (err) {
      if (!courant()) return;
      setCapital(null);
      setCapitalErreur(
        err instanceof OfflineReadError
          ? 'Pas de réseau : l’écriture de capital ne s’affiche pas hors ligne.'
          : err instanceof ApiError
            ? err.message
            : 'Impossible de charger l’écriture de capital.',
      );
    } finally {
      if (courant()) setCapitalCleChargee(cleChargement);
    }
  }, [token, projectId, cleChargement]);

  useEffect(() => {
    void charger();
    void chargerCapital();
  }, [charger, chargerCapital]);

  const changer = (champ: Champ) => (e: { target: { value: string } }) => {
    saisieTouchee.current = projectId;
    setSaisie((s) => ({ ...s, [champ]: e.target.value }));
  };

  /** Pose les erreurs : à côté du champ qu'elles désignent, sinon dans la liste générale. */
  const montrerErreurs = (messages: string[]) => {
    const { champs, autres } = repartir(messages);
    setErreursChamps(champs);
    setErreurs(autres);
    const premier = ORDRE_CHAMPS.find((champ) => champs[champ]);
    if (premier) document.getElementById(ID_CHAMP[premier])?.focus();
  };

  const effacerMessages = () => {
    setErreurs([]);
    setErreursChamps({});
    setSucces(null);
  };

  const enregistrer = async (e?: FormEvent) => {
    e?.preventDefault();
    effacerMessages();
    const manquants = OBLIGATOIRES.filter(([champ]) => !saisie[champ].trim()).map(([, message]) => message);
    if (manquants.length > 0) {
      montrerErreurs(manquants);
      return;
    }
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
      saisieTouchee.current = null;
      setEtat(recu);
      setSaisie(saisieDepuis(recu));
      setModification(false);
      setSucces('Fiche enregistrée.');
      onChanged?.();
      void chargerCapital();
    } catch (err) {
      montrerErreurs(messagesErreur(err, 'Impossible d’enregistrer la fiche.'));
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
    effacerMessages();
    setIsSaving(true);
    try {
      const recu = await api.supprimerImmatriculation(token, projectId);
      if (!estEtat(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      saisieTouchee.current = null;
      setEtat(recu);
      setSaisie(saisieDepuis(recu));
      setModification(false);
      setSucces('Fiche supprimée.');
      onChanged?.();
      void chargerCapital();
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
    effacerMessages();
    setIsSaving(true);
    try {
      // Ce que la personne a vu : le serveur refuse si la proposition a changé.
      const recu = await api.enregistrerCapitalImmatriculation(token, projectId, {
        montantCents: proposition.montantCents,
        date: proposition.date,
      });
      if (!estEtatCapital(recu)) throw new ApiError(REPONSE_ILLISIBLE, 0);
      ++dernierCapital.current;
      setCapital(recu);
      setCapitalErreur(null);
      setCapitalCleChargee(cleChargement);
      // La fiche porte désormais l'écriture : elle ne peut plus être supprimée.
      setEtat((e) =>
        e?.registration ? { ...e, registration: { ...e.registration, capitalEntryId: recu.entryId } } : e,
      );
      setSucces('Écriture de capital enregistrée dans ta comptabilité.');
    } catch (err) {
      setErreurs(messagesErreur(err, 'Impossible d’enregistrer l’écriture de capital.'));
      // L'état réel du serveur, pas celui qu'on suppose (proposition changée, doublon…).
      void chargerCapital();
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

  const champsEnErreur = ORDRE_CHAMPS.some((champ) => erreursChamps[champ]);
  const blocErreurs =
    erreurs.length === 0 && !champsEnErreur ? null : (
      <div className="error" role="alert">
        {champsEnErreur && <p>La fiche n’a pas été enregistrée : vérifie les champs signalés.</p>}
        {erreurs.length === 1 ? (
          <p>{erreurs[0]}</p>
        ) : erreurs.length > 1 ? (
          <ul>
            {erreurs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
      </div>
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
        <button
          className="secondary"
          type="button"
          onClick={() => {
            void charger();
            void chargerCapital();
          }}
        >
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
  // Ce que le journal dit, pas l'identifiant posé sur la fiche (qui peut
  // n'être qu'une réservation) ; repli sur la fiche si le capital n'a pas pu
  // être lu — par prudence, sans proposer de suppression.
  const capitalEnregistre = capital ? capital.dejaEnregistree : !!fiche?.capitalEntryId;

  /** Attributs d'accessibilité d'un champ : aide éventuelle, et son erreur. */
  const attributsChamp = (champ: Champ, aide?: string) => {
    const enErreur = !!erreursChamps[champ];
    const decrit = [aide, enErreur ? `${ID_CHAMP[champ]}-erreur` : undefined].filter(Boolean).join(' ');
    return {
      'aria-invalid': enErreur ? (true as const) : undefined,
      'aria-describedby': decrit || undefined,
    };
  };
  const erreurChamp = (champ: Champ) =>
    erreursChamps[champ] ? (
      <p className="error" id={`${ID_CHAMP[champ]}-erreur`}>
        {erreursChamps[champ]!.join(' ')}
      </p>
    ) : null;

  const enregistree = capital?.enregistree ?? null;

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
              effacerMessages();
              setSaisie(saisieDepuis(etat));
              setModification(true);
            }}
            disabled={isSaving}
          >
            Modifier la fiche
          </button>{' '}
          {capitalEnregistre ? (
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
        <form onSubmit={(e) => void enregistrer(e)} noValidate aria-label="Fiche d’immatriculation">
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
          <label htmlFor={ID_CHAMP.siren}>SIREN (9 chiffres, obligatoire)</label>
          <input
            id={ID_CHAMP.siren}
            {...attributsChamp('siren')}
            inputMode="numeric"
            autoComplete="off"
            required
            aria-required="true"
            value={saisie.siren}
            maxLength={20}
            onChange={changer('siren')}
          />
          {erreurChamp('siren')}
          <label htmlFor={ID_CHAMP.siret}>SIRET du siège (14 chiffres, facultatif)</label>
          <input
            id={ID_CHAMP.siret}
            {...attributsChamp('siret')}
            inputMode="numeric"
            autoComplete="off"
            value={saisie.siret}
            maxLength={30}
            onChange={changer('siret')}
          />
          {erreurChamp('siret')}
          <label htmlFor={ID_CHAMP.vatNumber}>Numéro de TVA intracommunautaire (facultatif)</label>
          <input
            id={ID_CHAMP.vatNumber}
            {...attributsChamp('vatNumber')}
            autoComplete="off"
            value={saisie.vatNumber}
            maxLength={30}
            onChange={changer('vatNumber')}
          />
          {erreurChamp('vatNumber')}
          <label htmlFor={ID_CHAMP.legalName}>Dénomination (obligatoire)</label>
          <input
            id={ID_CHAMP.legalName}
            {...attributsChamp('legalName', proposeLegalName ? 'immatriculation-denomination-aide' : undefined)}
            required
            aria-required="true"
            value={saisie.legalName}
            maxLength={200}
            onChange={changer('legalName')}
          />
          {proposeLegalName && (
            <p className="muted" id="immatriculation-denomination-aide">
              Proposé depuis le titre du projet — à confirmer.
            </p>
          )}
          {erreurChamp('legalName')}
          <label htmlFor={ID_CHAMP.headOffice}>Adresse du siège (obligatoire)</label>
          <input
            id={ID_CHAMP.headOffice}
            {...attributsChamp('headOffice', proposeHeadOffice ? 'immatriculation-siege-aide' : undefined)}
            required
            aria-required="true"
            value={saisie.headOffice}
            maxLength={300}
            onChange={changer('headOffice')}
          />
          {proposeHeadOffice && (
            <p className="muted" id="immatriculation-siege-aide">
              Proposé depuis tes statuts retenus — à confirmer.
            </p>
          )}
          {erreurChamp('headOffice')}
          <label htmlFor={ID_CHAMP.registeredOn}>Date d’immatriculation (obligatoire)</label>
          <input
            id={ID_CHAMP.registeredOn}
            {...attributsChamp('registeredOn')}
            type="date"
            required
            aria-required="true"
            value={saisie.registeredOn}
            onChange={changer('registeredOn')}
          />
          {erreurChamp('registeredOn')}
          <button className="primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche'}
          </button>
          {fiche && (
            <>
              {' '}
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  effacerMessages();
                  saisieTouchee.current = null;
                  setSaisie(saisieDepuis(etat));
                  setModification(false);
                }}
                disabled={isSaving}
              >
                Annuler
              </button>
            </>
          )}
        </form>
      )}

      <h3>Écriture de capital</h3>
      {capitalErreur ? (
        <>
          <p className="error" role="alert">
            {capitalErreur}
          </p>
          <button className="secondary" type="button" onClick={() => void chargerCapital()}>
            Réessayer
          </button>
        </>
      ) : capitalEnChargement || !capital ? (
        <p className="loading">Chargement de l’écriture de capital…</p>
      ) : capital.dejaEnregistree ? (
        <>
          <p>
            <span className="pill pill--fire">
              <span aria-hidden="true">✓</span> Déjà enregistrée
            </span>{' '}
            L’écriture de capital est déjà dans ta comptabilité.
          </p>
          {enregistree && (
            <>
              <p>
                Écriture enregistrée : {enregistree.libelle}, le {jourSaisi(enregistree.date)}, pour{' '}
                {euros(enregistree.montantCents)}.
              </p>
              <TableEcriture lignes={enregistree.lignes} />
            </>
          )}
        </>
      ) : capital.proposition ? (
        <>
          <p>
            Écriture proposée : {capital.proposition.libelle}, le {jourSaisi(capital.proposition.date)}, pour{' '}
            {euros(capital.proposition.montantCents)}.
          </p>
          <TableEcriture lignes={capital.proposition.lignes} />
          {capital.enregistrementEnCours ? (
            <p className="notice" role="status">
              Un enregistrement est en cours, réessaie dans un instant.
            </p>
          ) : (
            <>
              <p className="muted">Rien n’est écrit dans ta comptabilité sans ce clic, et une seule fois.</p>
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
    </div>
  );
}
