import Link from "next/link";
import { useId } from "react";
import {
  enCredits,
  MessageErreurIgini,
  useCredits,
  type ErreurIgini,
} from "@/components/prix-igini";
import type { VueEnchainement } from "@/lib/api";

const ETAT_LU: Record<VueEnchainement["etapes"][number]["etat"], string> = {
  fait: "fait",
  "en-cours": "en cours",
  "a-faire": "à venir",
};

/**
 * « LANCE IGINI SUR TON PROJET » — ce qu'un projet tout neuf montre en premier.
 *
 * Depuis le 2026-10-31, un clic enchaîne les cinq étapes d'IGINI (analyse,
 * forme juridique, plans de construction, de financement et de
 * développement) : plus de règle des 75/100, tout projet est fait. Le prix
 * de ce qui reste à faire est annoncé avant le clic ; le serveur fait le
 * travail, la page le suit, et la personne peut la fermer.
 *
 * La carte reste là tant que ça tourne, et après un arrêt (crédits épuisés,
 * IGINI en pause, panne) pour dire pourquoi et proposer de reprendre.
 *
 * Quand IGINI est en pause, la fiche ne la montre pas : le guide habituel
 * dit déjà, honnêtement, comment avancer à la main.
 */
export function LancerIgini({
  vue,
  lancement,
  erreur,
  onLancer,
  onMasquer,
  questionnaireHref,
}: {
  vue: VueEnchainement;
  /** La demande de lancement est partie, la réponse n'est pas revenue. */
  lancement: boolean;
  /** Le lancement lui-même a été refusé. */
  erreur: ErreurIgini | null;
  onLancer: () => void;
  /** Ranger la carte après un arrêt, le temps de cette visite. */
  onMasquer: () => void;
  /** Le lien vers le questionnaire, s'il reste à remplir ; `null` sinon. */
  questionnaireHref: string | null;
}) {
  const titreId = useId();
  const credits = useCredits();
  const enCours = vue.statut === "en-cours";
  const termine = vue.statut === "termine";
  const arrete = vue.statut === "arrete";
  const aFaire = vue.etapes.filter((e) => e.etat !== "fait");
  const premiere = aFaire[0];

  // Dans le projet d'un autre, ce sont les crédits du propriétaire qui
  // paient : le solde du membre ne dit rien, le serveur tranche.
  const solde = credits && !credits.payeParLeProprietaire ? credits.solde : null;
  const rienDuTout = solde !== null && !!premiere && solde < premiere.credits;
  const pasTout = solde !== null && !rienDuTout && solde < vue.creditsRestants;

  return (
    <section
      className="card premiere-analyse"
      aria-labelledby={titreId}
      style={{ marginBottom: "1.5rem" }}
    >
      <p className="premiere-analyse__etiquette">
        {enCours ? "IGINI travaille" : termine ? "C’est prêt" : arrete ? "À reprendre" : "Première étape"}
      </p>
      <h2 id={titreId} style={{ marginTop: 0 }}>
        {enCours ? "IGINI prépare ton projet" : "Lance IGINI sur ton projet"}
      </h2>

      {termine ? (
        <p style={{ marginTop: 0 }}>
          Ton analyse, ta forme juridique et tes trois plans sont prêts : ouvre
          les étapes ci-dessous pour les lire.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {enCours
            ? "Tu peux fermer cette page : IGINI continue, et chaque résultat apparaît ci-dessous dès qu’il est prêt."
            : arrete
              ? "Ce qui est fait reste acquis : reprendre ne relance que ce qui manque."
              : "En un clic, IGINI enchaîne ces étapes l’une après l’autre, en cinq minutes environ :"}
        </p>
      )}

      <ol className="lancer-igini__etapes">
        {vue.etapes.map((etape) => (
          <li key={etape.id} className="lancer-igini__etape" data-etat={etape.etat}>
            <span className="lancer-igini__repere" aria-hidden="true">
              {etape.etat === "fait" ? "✓" : etape.etat === "en-cours" ? "…" : "·"}
            </span>
            <span>
              {etape.libelle}
              <span className="visuellement-cache"> — {ETAT_LU[etape.etat]}</span>
            </span>
            {etape.etat !== "fait" && (
              <span className="lancer-igini__prix">{enCredits(etape.credits)}</span>
            )}
          </li>
        ))}
      </ol>

      {arrete && vue.arret && (
        <p className="error" role="alert">
          IGINI s’est arrêté à « {vue.etapes.find((e) => e.id === vue.arret?.etape)?.libelle} » :{" "}
          {vue.arret.message}
          {vue.arret.voirCredits && (
            <>
              {" "}
              <Link href="/credits">Voir mes crédits</Link>
            </>
          )}
        </p>
      )}

      {!enCours && !termine && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="primary premiere-analyse__bouton"
              type="button"
              onClick={onLancer}
              disabled={lancement || rienDuTout}
            >
              {lancement
                ? "Lancement…"
                : arrete
                  ? "Reprendre où IGINI s’est arrêté"
                  : "Lancer IGINI sur mon projet"}
            </button>
            {arrete && (
              <button className="secondary" type="button" onClick={onMasquer}>
                Plus tard
              </button>
            )}
          </div>
          <p className="prix-igini prix-igini--ligne">
            {aFaire.length > 1 ? `Ces ${aFaire.length} étapes coûtent ` : "Cette étape coûte "}
            <strong className="credits-montant">{enCredits(vue.creditsRestants)}</strong>
            {solde === null ? (
              credits?.payeParLeProprietaire ? ", pris sur les crédits du propriétaire du projet." : "."
            ) : (
              <>
                {" "}
                — il t’en reste <strong className="credits-montant">{solde}</strong>
                {rienDuTout || pasTout ? (
                  <>
                    {rienDuTout
                      ? " : pas assez pour commencer."
                      : " : IGINI ira aussi loin qu’ils le permettent, puis s’arrêtera."}{" "}
                    <Link href="/credits">Voir mes crédits</Link>
                  </>
                ) : (
                  "."
                )}
              </>
            )}
          </p>
        </>
      )}

      <MessageErreurIgini erreur={erreur} />

      {questionnaireHref && vue.statut === "pret" && !lancement && (
        <p className="premiere-analyse__affiner">
          Pour une analyse plus juste,{" "}
          <Link href={questionnaireHref}>
            réponds d&apos;abord à quelques questions
          </Link>{" "}
          (facultatif).
        </p>
      )}
    </section>
  );
}
