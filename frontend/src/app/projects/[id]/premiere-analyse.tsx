import Link from "next/link";
import { useId } from "react";
import {
  MessageErreurIgini,
  PrixIgini,
  usePrixIgini,
  type ErreurIgini,
} from "@/components/prix-igini";
import { AnalyseEnCours } from "./analyse-resultat";

/**
 * LA PREMIÈRE ANALYSE — ce qu'un projet tout neuf montre en premier.
 *
 * Jusqu'au 2026-10-31, le bouton « Analyser ce projet » attendait derrière
 * une icône, sous un tableau de bord vide, un guide, une visite qui
 * s'ouvrait d'elle-même et deux encarts de questions : la première valeur
 * d'Ignitux était la chose la plus difficile à trouver sur l'écran. Tant que
 * la prochaine étape du parcours (décidée par le serveur) est « Analyser »,
 * cette carte prend la place de tout cela : ce que fait l'analyse, son prix,
 * un bouton.
 *
 * Quand IGINI est en pause, la fiche ne la montre pas : le guide habituel dit
 * déjà, honnêtement, comment avancer à la main.
 *
 * Le questionnaire reste proposé, facultatif : il rend l'analyse plus juste,
 * il ne doit plus passer avant elle.
 */
export function PremiereAnalyse({
  isBusy,
  error,
  onLancer,
  questionnaireHref,
}: {
  isBusy: boolean;
  error: ErreurIgini | null;
  onLancer: () => void;
  /** Le lien vers le questionnaire, s'il reste à remplir ; `null` sinon. */
  questionnaireHref: string | null;
}) {
  const titreId = useId();
  const prix = usePrixIgini("analyser");

  return (
    <section
      className="card premiere-analyse"
      aria-labelledby={titreId}
      style={{ marginBottom: "1.5rem" }}
    >
      <p className="premiere-analyse__etiquette">Première étape</p>
      <h2 id={titreId} style={{ marginTop: 0 }}>
        Lance ta première analyse IGINI
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        IGINI lit le nom et la description de ton projet, et te rend en une à
        deux minutes : un résumé, une note de faisabilité sur 10, les points
        forts, les risques et les prochaines étapes.
      </p>

      <button
        className="primary premiere-analyse__bouton"
        type="button"
        onClick={onLancer}
        disabled={isBusy || !!prix?.insuffisant}
      >
        {isBusy ? "Analyse en cours…" : "Lancer l’analyse IGINI"}
      </button>
      {/* Le prix et le solde, avant de toucher ; « Voir mes crédits » quand
          le solde ne suffit pas. */}
      <PrixIgini generateur="analyser" className="prix-igini--ligne" />
      <MessageErreurIgini erreur={error} />
      {isBusy && <AnalyseEnCours />}

      {questionnaireHref && !isBusy && (
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
