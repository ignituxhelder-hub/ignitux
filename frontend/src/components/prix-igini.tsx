'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  creditsInsuffisants,
  type BaremeCredits,
  type GenerateurIgini,
  type VueCredits,
} from '@/lib/api';

/**
 * LE PRIX D'UNE ACTION IGINI, DIT AVANT DE LA LANCER.
 *
 * Spec : docs/superpowers/specs/2026-10-25-credits-design.md. Chaque action
 * IGINI se paie en crédits, à un prix fixe : la personne le lit à côté du
 * bouton (« Cette action coûte 4 crédits — il t'en reste 26. »), et un solde
 * qui ne suffit pas grise le bouton et mène à « Mes crédits » au lieu de
 * laisser partir une demande que le serveur refusera.
 *
 * ## Une lecture par écran
 *
 * `CreditsProvider` lit `GET /credits` une fois (le solde et le barème
 * arrivent ensemble) ; chaque bouton de l'écran s'en sert. `actualiser()`
 * relit après une action réussie : le solde vient de bouger.
 *
 * ## Ce que l'écran ne décide pas
 *
 * - Hors d'un fournisseur, ou sans réponse lisible : rien n'est affiché et
 *   rien n'est bloqué. Le serveur revérifie toujours (402) ; mieux vaut un
 *   bouton sans prix qu'un bouton éteint à tort.
 * - Dans le projet d'un autre (`payeParLeProprietaire`), ce sont les crédits
 *   du propriétaire qui paient : le solde du membre ne dit rien, il n'est ni
 *   affiché ni bloquant. Le serveur tranche.
 */

export interface CreditsContexte {
  /** null tant qu'on ne le sait pas (ou que la lecture a échoué). */
  solde: number | null;
  bareme: BaremeCredits | null;
  payeParLeProprietaire: boolean;
  /** Relit le solde — après une action réussie, il a bougé. */
  actualiser: () => void;
}

const Contexte = createContext<CreditsContexte | null>(null);

function lisible(vue: unknown): vue is VueCredits {
  const v = vue as Partial<VueCredits> | null;
  return (
    !!v &&
    typeof v.solde === 'number' &&
    !!v.bareme &&
    Array.isArray(v.bareme.actions)
  );
}

export function CreditsProvider({
  token,
  payeParLeProprietaire = false,
  version = 0,
  children,
}: {
  token: string | null;
  payeParLeProprietaire?: boolean;
  /** Change quand l'écran sait que le solde a bougé (une génération réussie) : on relit. */
  version?: number;
  children: ReactNode;
}) {
  const [vue, setVue] = useState<VueCredits | null>(null);
  const [lecture, setLecture] = useState(0);

  useEffect(() => {
    if (!token) return;
    let annule = false;
    api
      .getCredits(token)
      .then((recu) => {
        if (!annule) setVue(lisible(recu) ? recu : null);
      })
      // Sans réponse : pas de prix affiché, rien de bloqué — le serveur tranche.
      .catch(() => {
        if (!annule) setVue(null);
      });
    return () => {
      annule = true;
    };
  }, [token, lecture, version]);

  const actualiser = useCallback(() => setLecture((n) => n + 1), []);
  const valeur = useMemo<CreditsContexte>(
    () => ({
      solde: vue?.solde ?? null,
      bareme: vue?.bareme ?? null,
      payeParLeProprietaire,
      actualiser,
    }),
    [vue, payeParLeProprietaire, actualiser],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Le solde et le barème de l'écran, ou null hors d'un `CreditsProvider`. */
export function useCredits(): CreditsContexte | null {
  return useContext(Contexte);
}

export interface PrixAction {
  /** Le prix total, en crédits (prix unitaire × quantité). */
  prix: number;
  par: 'action' | 'message';
  /** null quand on ne le sait pas, ou quand c'est le propriétaire qui paie. */
  solde: number | null;
  /** Vrai seulement quand on sait que le solde ne suffit pas : le bouton se grise. */
  insuffisant: boolean;
  payeParLeProprietaire: boolean;
  quantite: number;
}

/** Le prix d'une action (× `quantite` pour un lot), ou null si on ne le connaît pas. */
export function usePrixIgini(generateur: GenerateurIgini, quantite = 1): PrixAction | null {
  const contexte = useCredits();
  const ligne = contexte?.bareme?.actions.find((a) => a.generateur === generateur);
  if (!contexte || !ligne) return null;
  const prix = ligne.credits * Math.max(1, quantite);
  const solde = contexte.payeParLeProprietaire ? null : contexte.solde;
  return {
    prix,
    par: ligne.par,
    solde,
    insuffisant: solde !== null && solde < prix,
    payeParLeProprietaire: contexte.payeParLeProprietaire,
    quantite: Math.max(1, quantite),
  };
}

/** « 1 crédit », « 4 crédits ». */
export function enCredits(n: number): string {
  return `${n} crédit${Math.abs(n) > 1 ? 's' : ''}`;
}

function Montant({ children }: { children: ReactNode }) {
  return <strong className="credits-montant">{children}</strong>;
}

/**
 * La ligne de prix sous un bouton IGINI. Ne rend rien quand le prix n'est
 * pas connu : pas de « Cette action coûte ? crédits ».
 */
export function PrixIgini({
  generateur,
  quantite = 1,
  className,
}: {
  generateur: GenerateurIgini;
  quantite?: number;
  className?: string;
}) {
  const prix = usePrixIgini(generateur, quantite);
  if (!prix) return null;
  const classes = ['prix-igini', className].filter(Boolean).join(' ');

  if (prix.insuffisant && prix.solde !== null) {
    return (
      <p className={classes}>
        Crédits insuffisants : il te faut <Montant>{enCredits(prix.prix)}</Montant>, il t’en reste{' '}
        <Montant>{prix.solde}</Montant>. <Link href="/credits">Voir mes crédits</Link>
      </p>
    );
  }

  const reste =
    prix.solde === null ? (
      '.'
    ) : (
      <>
        {' '}
        — il t’en reste <Montant>{prix.solde}</Montant>.
      </>
    );

  if (prix.par === 'message') {
    return (
      <p className={classes}>
        <Montant>{enCredits(prix.prix)}</Montant> par message
        {prix.payeParLeProprietaire ? ', pris sur les crédits du propriétaire du projet.' : reste}
      </p>
    );
  }

  const debut =
    prix.quantite > 1 ? (
      <>
        Ces {prix.quantite} actions coûtent <Montant>{enCredits(prix.prix)}</Montant>
      </>
    ) : (
      <>
        Cette action coûte <Montant>{enCredits(prix.prix)}</Montant>
      </>
    );

  return (
    <p className={classes}>
      {debut}
      {prix.payeParLeProprietaire ? ', pris sur les crédits du propriétaire du projet.' : reste}
    </p>
  );
}

/** Une erreur d'action IGINI, prête à afficher. */
export interface ErreurIgini {
  message: string;
  /** Vrai pour un solde trop bas : « Voir mes crédits » a un sens. */
  voirCredits: boolean;
}

/**
 * Le refus du serveur, dit tel quel. Un solde trop bas (402
 * `credits_insuffisants`) porte en plus le lien vers « Mes crédits » ; le
 * garde-fou de coût (`plafond_securite`) non — des crédits de plus n'y
 * changeraient rien, et son message le dit.
 */
export function erreurIgini(err: unknown, repli: string): ErreurIgini {
  const manque = creditsInsuffisants(err);
  if (manque) {
    const message =
      err instanceof ApiError && err.message
        ? err.message
        : `Crédits insuffisants : il te faut ${enCredits(manque.requis)}, tu en as ${manque.disponible}.`;
    return { message, voirCredits: true };
  }
  return { message: err instanceof ApiError ? err.message : repli, voirCredits: false };
}

export function MessageErreurIgini({
  erreur,
  className = 'error',
}: {
  erreur: ErreurIgini | null;
  className?: string;
}) {
  if (!erreur) return null;
  return (
    <p className={className}>
      {erreur.message}
      {erreur.voirCredits && (
        <>
          {' '}
          <Link href="/credits">Voir mes crédits</Link>
        </>
      )}
    </p>
  );
}

/**
 * Le résumé d'un lot sous « Démarrer IGINI » : combien d'éléments, et ce
 * que le lot coûtera. Sans prix connu, on garde l'ancien repère (« ~N appels
 * IA ») plutôt que d'annoncer un montant qu'on ignore.
 */
export function ResumeLot({ nombre, generateur }: { nombre: number; generateur: GenerateurIgini }) {
  const prix = usePrixIgini(generateur, nombre);
  const pluriel = nombre > 1 ? 's' : '';
  const selection = `${nombre} élément${pluriel} sélectionné${pluriel}`;
  if (!prix) return <span className="muted">{`${selection}, ~${nombre} appel${pluriel} IA`}</span>;
  return (
    <div>
      <span className="muted">{selection}</span>
      <PrixIgini generateur={generateur} quantite={nombre} />
    </div>
  );
}
