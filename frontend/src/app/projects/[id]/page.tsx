"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Icone } from "@/components/icones";
import { IginiMention } from "@/components/igini-mention";
import {
  GuideParcours,
  ProchaineEtape,
  Progression,
  SectionsFermees,
  TableauDeBord,
} from "@/components/parcours";
import {
  marquerVisiteVue,
  VisiteGuidee,
  visiteDejaVue,
  type ArretVisite,
} from "@/components/visite-guidee";
import { ETAPES_PROJET, OUTILS_PROJET } from "@/lib/etapes-projet";
import { destinationDe } from "@/lib/guide-projet";
import { AnalyseEnCours, AnalyseResultat } from "./analyse-resultat";
import { FormeJuridiqueResultat } from "./forme-juridique-resultat";
import { LancerIgini } from "./lancer-igini";
import { ChampsADemander } from "@/components/champs-profil";
import {
  CreditsProvider,
  erreurIgini,
  MessageErreurIgini,
  PrixIgini,
  usePrixIgini,
  type ErreurIgini,
} from "@/components/prix-igini";
import {
  api,
  ApiError,
  type Analysis,
  type BuildPlan,
  type DevelopmentPlan,
  type FinancingPlan,
  type GenerateurIgini,
  type IginiStatus,
  type JourneyView,
  type LegalFormRecommendation,
  type ProfileField,
  type Project,
  type TransmissionPlan,
  type VueEnchainement,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AutomationSection } from "./automation-section";
import { WorkflowSection } from "./workflow-section";
import { BuybackSection, FinancingSection } from "./financing-section";
import { ParticipationSection } from "./participation-section";
import { EvaluationSection } from "./evaluation-section";
import { CollaboratorsSection } from "./collaborators-section";
import {
  lectureDeSection,
  ROLE_EQUIPE_LABEL,
  type Capacite,
  type MonAcces,
} from "@/lib/equipe";
import { StatutsSection } from "./statuts-section";
import { DossierCreationSection } from "./dossier-creation-section";
import { ImmatriculationSection } from "./immatriculation-section";
import { DocumentsJuridiquesLecture } from "./documents-juridiques-lecture";
import { ComplianceSection } from "./compliance-section";
import {
  KnowledgeSection,
  MemorySection,
  ScoreHistorySection,
  ScoreSection,
  TasksSection,
} from "./engine-sections";
import { MandatSection } from "./mandat-section";

/**
 * Les arrêts de la visite guidée, à la première ouverture d'un projet. Cinq
 * au plus : on montre où regarder, on n'explique pas tout le produit.
 */
const ARRETS_VISITE: readonly ArretVisite[] = [
  {
    cible: "reperes",
    titre: "L’état de ton projet",
    texte: "Ici, l’état de ton projet en un coup d’œil.",
  },
  {
    cible: "progression",
    titre: "Les trois phases",
    texte:
      "Ton projet passe par trois phases : découvrir, construire, transmettre. La tienne est mise en avant.",
  },
  {
    cible: "guide",
    titre: "Ton parcours",
    texte:
      "Chaque fois que tu reviens, regarde ici : Ignitux te dit quoi faire ensuite. Touche « Y aller » et il t’y emmène.",
  },
  {
    cible: "etapes",
    titre: "Les étapes",
    texte: "Le travail fait avec IGINI est rangé ici, une étape par icône.",
  },
  {
    cible: "vue-avancee",
    titre: "Vue avancée",
    texte:
      "Les outils plus poussés (tâches, score, conformité…) sont ici, quand tu en auras besoin.",
  },
];

/**
 * Demande au serveur si les 5 générateurs IGINI sont disponibles.
 *
 * Tant qu'on n'a pas la réponse — et si la requête échoue — l'état reste
 * `null`, et l'interface se comporte comme d'habitude. C'est volontaire :
 * annoncer « indisponible » sans le savoir serait aussi faux qu'annoncer
 * « disponible » sans le savoir, à ceci près que la première erreur
 * empêcherait quelqu'un d'utiliser une fonctionnalité qui marche.
 */
function useIginiStatus() {
  const [status, setStatus] = useState<IginiStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getIginiStatus()
      .then((data) => {
        if (cancelled) return;
        // On n'accepte que ce qui est réellement exploitable. Une réponse
        // inattendue laisse l'état à `null` : elle ne doit pas pouvoir
        // éteindre une fonctionnalité qui marche.
        if (typeof data?.generatorsEnabled === "boolean") setStatus(data);
      })
      .catch(() => {
        // On ne sait pas : on laisse le serveur trancher au clic.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

/** Charge la liste d'un type de plan (analyse, financement, …) pour le projet courant. */
function usePlanList<T>(
  token: string | null,
  id: string,
  list: (token: string, id: string) => Promise<T[]>,
  /** Faux tant que le rôle ne permet pas de lire cette liste : on ne la demande pas. */
  actif = true,
  /** Change quand le serveur a produit un élément de plus (enchaînement IGINI) : on relit. */
  version = 0,
) {
  const [items, setItems] = useState<T[]>([]);
  const projetCharge = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !actif) return;
    let cancelled = false;

    // Repart de zéro à chaque changement de projet, pour ne pas laisser
    // apparaître les éléments du projet précédent le temps du nouveau fetch.
    // Une simple relecture du même projet garde la liste affichée.
    if (projetCharge.current !== id) {
      projetCharge.current = id;
      setItems([]);
    }

    list(token, id)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        // Pas bloquant : l'historique de ce plan est secondaire à la fiche projet.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, actif, version]);

  return [items, setItems] as const;
}

/**
 * Génère un nouveau plan (bouton "Analyser", "Générer un plan", …) et le préfixe à la liste.
 *
 * `onGenerated` est appelé après un succès : côté backend, chaque génération déclenche aussi
 * l'automatisation (tâches d'étape créées/fermées, concepts reliés) et fait bouger le score.
 * Sans ce signal, ces sections resteraient figées jusqu'au rechargement de la page, ce qui
 * donnait l'impression que l'automatisation ne faisait rien.
 */
function useGeneration<T>(
  token: string | null,
  id: string,
  create: (token: string, id: string) => Promise<T>,
  setItems: Dispatch<SetStateAction<T[]>>,
  failureMessage: string,
  onGenerated?: () => void,
) {
  const [isBusy, setIsBusy] = useState(false);
  // Une erreur IGINI peut être un solde trop bas : elle porte alors le lien
  // « Voir mes crédits » (voir components/prix-igini.tsx).
  const [error, setError] = useState<ErreurIgini | null>(null);

  async function generate() {
    if (!token) return;
    setError(null);
    setIsBusy(true);
    try {
      const created = await create(token, id);
      setItems((prev) => [created, ...prev]);
      onGenerated?.();
    } catch (err) {
      setError(erreurIgini(err, failureMessage));
    } finally {
      setIsBusy(false);
    }
  }

  return { isBusy, error, generate };
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user, isReady } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  // Le rôle de la personne sur ce projet et ce qu'il permet (voir lib/equipe.ts).
  const [acces, setAcces] = useState<MonAcces | null>(null);
  const [accesEchoue, setAccesEchoue] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [erreurArchivage, setErreurArchivage] = useState<string | null>(null);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

  // Incrémenté après chaque génération réussie : signale aux sections dérivées
  // (score, tâches, automatisation, connaissance) qu'elles doivent se recharger.
  const [refreshSignal, setRefreshSignal] = useState(0);
  // Incrémenté quand les statuts sont générés, régénérés ou retenus : le
  // dossier de création (pièce « statuts ») se recharge alors.
  const [versionStatuts, setVersionStatuts] = useState(0);
  // Incrémenté quand la fiche d'immatriculation est enregistrée ou supprimée :
  // le bandeau « Immatriculée » du dossier de création en dépend.
  const [versionImmatriculation, setVersionImmatriculation] = useState(0);
  const [parcours, setParcours] = useState<JourneyView | null>(null);
  const [vueAvancee, setVueAvancee] = useState(false);
  // Laquelle des six étapes (voir lib/etapes-projet.ts) affiche son contenu en
  // ce moment — jamais plus d'une, c'est tout le principe de la grille
  // d'icônes qui remplace l'empilement de texte.
  const [etapeOuverte, setEtapeOuverte] = useState<string | null>(null);
  // La transmission ne s'ouvre pas d'elle-même (voir journey-model.ts) :
  // la personne la demande. Rien n'est enregistré — elle reste ouverte pour
  // de bon une fois un plan rédigé, c'est le parcours qui le dira.
  const [transmissionDemandee, setTransmissionDemandee] = useState(false);
  const [aDemander, setADemander] = useState<ProfileField[]>([]);
  // null tant qu'on ne sait pas : on n'affiche rien plutôt qu'un rappel
  // qui disparaîtrait une seconde plus tard.
  const [questionnaireTermine, setQuestionnaireTermine] = useState<boolean | null>(null);
  const onGenerated = () => setRefreshSignal((n) => n + 1);

  /**
   * ALLER AUX TÂCHES DEPUIS LA TUILE QUI DIT QU'IL N'Y EN A PAS.
   *
   * La tuile « Tâches » annonçait « Aucune tâche encore. » et s'arrêtait là.
   * Le bouton pour en ajouter une existe, mais dans une section que la vue
   * simple ne montre pas — donc derrière « Vue avancée », dont le libellé ne
   * l'annonce pas. Constater un vide sans offrir de le combler renvoie la
   * personne chercher elle-même.
   *
   * Deux temps sont nécessaires : la section n'existe pas au moment du clic,
   * elle naît du passage en vue avancée. On lève donc un drapeau, et on défile
   * une fois qu'elle est montée.
   */
  const [allerAuxTaches, setAllerAuxTaches] = useState(false);
  useEffect(() => {
    if (!token) return;
    let annule = false;
    api
      .getMonAcces(token, id)
      .then((a) => {
        // Garde défensive : une réponse inattendue retombe sur l'affichage par défaut.
        if (annule) return;
        const lu = a && Array.isArray(a.capacites) ? a : null;
        setAcces(lu);
        setAccesEchoue(lu === null);
      })
      // Sans réponse : l'affichage d'avant les rôles (voir peut()), le serveur tranche.
      .catch(() => {
        if (!annule) {
          setAcces(null);
          setAccesEchoue(true);
        }
      });
    return () => {
      annule = true;
    };
  }, [token, id]);

  useEffect(() => {
    if (!allerAuxTaches) return;
    const cible = document.getElementById("taches");
    if (!cible) return;
    const sansAnimation = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    cible.scrollIntoView({
      behavior: sansAnimation ? "auto" : "smooth",
      block: "start",
    });
    setAllerAuxTaches(false);
  }, [allerAuxTaches, vueAvancee]);

  /**
   * « Y ALLER » — même mécanique en deux temps que les tâches ci-dessus :
   * l'élément à désigner n'existe qu'une fois son étape ouverte. On retient
   * le sélecteur, et on le cherche après le rendu. Trouvé, il pulse trois
   * secondes ; absent (générateurs éteints : pas de bouton), on mène à la
   * section sans rien faire pulser dans le vide.
   */
  const [cibleGuide, setCibleGuide] = useState<{
    selecteur: string | null;
    section: string;
  } | null>(null);
  useEffect(() => {
    if (!cibleGuide) return;
    const sansAnimation =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const element = cibleGuide.selecteur
      ? document.querySelector<HTMLElement>(cibleGuide.selecteur)
      : null;
    const repli = document.getElementById(`section-${cibleGuide.section}`);
    setCibleGuide(null);
    if (!element) {
      repli?.scrollIntoView?.({
        behavior: sansAnimation ? "auto" : "smooth",
        block: "start",
      });
      return;
    }
    element.scrollIntoView?.({
      behavior: sansAnimation ? "auto" : "smooth",
      block: "center",
    });
    if (element.id === "description") element.focus();
    element.classList.add("guide-cible");
    window.setTimeout(() => element.classList.remove("guide-cible"), 3000);
  }, [cibleGuide, etapeOuverte, vueAvancee]);

  // La visite se propose d'elle-même une seule fois, au porteur, une fois
  // le parcours chargé (sans lui, la moitié des arrêts manqueraient).
  // Décidé une fois par ouverture de la fiche : sur un projet tout neuf, la
  // carte IGINI passe d'abord (voir LancerIgini) — la visite attend
  // la prochaine ouverture, au lieu de s'ouvrir par-dessus le bouton, ou
  // par-dessus le résultat quand le parcours se recharge.
  const [visiteOuverte, setVisiteOuverte] = useState(false);
  const porteur = !!project && !!user && project.owner_id === user.id;
  const visiteDecidee = useRef(false);
  useEffect(() => {
    if (visiteDecidee.current || !porteur || !parcours) return;
    visiteDecidee.current = true;
    if (parcours.nextStep?.id !== "analyser" && !visiteDejaVue()) setVisiteOuverte(true);
  }, [porteur, parcours]);
  const fermerVisite = useCallback(() => {
    marquerVisiteVue();
    setVisiteOuverte(false);
  }, []);

  const iginiStatus = useIginiStatus();

  // L'enchaînement IGINI (voir lancer-igini.tsx) : où il en est sur le
  // serveur. `versionEnchainement` change à chaque étape terminée, pour que
  // les listes de plans se relisent sans attendre un rechargement.
  const [enchainement, setEnchainement] = useState<VueEnchainement | null>(null);
  const [lancementIgini, setLancementIgini] = useState(false);
  const [erreurLancement, setErreurLancement] = useState<ErreurIgini | null>(null);
  // Cette visite a vu l'enchaînement tourner : sa fin se dit, une fois.
  const [enchainementVu, setEnchainementVu] = useState(false);
  const [enchainementMasque, setEnchainementMasque] = useState(false);
  const [versionEnchainement, setVersionEnchainement] = useState(0);

  /**
   * Ce que le rôle permet de lire, pour ne demander que les listes permises.
   * Sans /mon-acces, seul le propriétaire (reconnu sur le projet) charge tout.
   */
  const proprietaire = !!project && !!user && project.owner_id === user.id;
  const lisible = (c: Capacite): boolean =>
    acces ? acces.capacites.includes(c) : accesEchoue && proprietaire;

  const [analyses, setAnalyses] = usePlanList<Analysis>(
    token,
    id,
    api.listAnalyses,
    lisible("voir_projet"),
    versionEnchainement,
  );
  const analysis = useGeneration(
    token,
    id,
    api.analyzeProject,
    setAnalyses,
    "Impossible d'analyser le projet.",
    onGenerated,
  );

  // La première analyse est lancée depuis sa carte : dès qu'elle est là, on
  // ouvre la section Analyse et on y mène — c'est le résultat qu'on attend.
  const [premiereLancee, setPremiereLancee] = useState(false);
  useEffect(() => {
    if (!premiereLancee || analyses.length === 0) return;
    setPremiereLancee(false);
    setEtapeOuverte("analyse");
    window.requestAnimationFrame(() => {
      window.document
        .getElementById("section-analyse")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [premiereLancee, analyses.length]);

  // Une réponse qui n'a pas la forme attendue vaut « on ne sait pas » : la
  // fiche reste alors celle d'avant, sans la carte.
  const lireEnchainement = useCallback((vue: VueEnchainement) => {
    setEnchainement(Array.isArray(vue?.etapes) ? vue : null);
  }, []);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    setEnchainement(null);
    api
      .getEnchainement(token, id)
      .then((vue) => {
        if (!cancelled) lireEnchainement(vue);
      })
      .catch(() => {
        // Silencieux : sans l'état de l'enchaînement, la fiche reste utilisable.
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, lireEnchainement]);

  // Relu toutes les quatre secondes tant qu'il tourne : le travail se fait
  // sur le serveur, la page ne fait que le suivre.
  const statutEnchainement = enchainement?.statut ?? null;
  useEffect(() => {
    if (!token || statutEnchainement !== "en-cours") return;
    const minuteur = window.setInterval(() => {
      api
        .getEnchainement(token, id)
        .then(lireEnchainement)
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(minuteur);
  }, [token, id, statutEnchainement, lireEnchainement]);

  // Une étape de plus de faite, ou l'enchaînement qui s'arrête : les plans,
  // le score, le parcours et le solde se relisent.
  const etapesFaites = enchainement ? enchainement.etapes.filter((e) => e.etat === "fait").length : null;
  const dernierEtatEnchainement = useRef<string | null>(null);
  useEffect(() => {
    if (etapesFaites === null) return;
    const etat = `${etapesFaites}:${statutEnchainement}`;
    if (dernierEtatEnchainement.current !== null && dernierEtatEnchainement.current !== etat) {
      setVersionEnchainement((n) => n + 1);
      setRefreshSignal((n) => n + 1);
    }
    dernierEtatEnchainement.current = etat;
  }, [etapesFaites, statutEnchainement]);

  async function lancerIgini() {
    if (!token) return;
    setErreurLancement(null);
    setLancementIgini(true);
    try {
      lireEnchainement(await api.lancerEnchainement(token, id));
      setEnchainementVu(true);
      setEnchainementMasque(false);
      setPremiereLancee(true);
    } catch (err) {
      setErreurLancement(erreurIgini(err, "Impossible de lancer IGINI sur ce projet."));
    } finally {
      setLancementIgini(false);
    }
  }

  const [legalForms, setLegalForms] = usePlanList<LegalFormRecommendation>(
    token,
    id,
    api.listLegalFormRecommendations,
    lisible("voir_projet"),
    versionEnchainement,
  );
  const legalForm = useGeneration(
    token,
    id,
    api.recommendLegalForm,
    setLegalForms,
    "Impossible de recommander une forme juridique.",
    onGenerated,
  );

  const [buildPlans, setBuildPlans] = usePlanList<BuildPlan>(
    token,
    id,
    api.listBuildPlans,
    lisible("voir_projet"),
    versionEnchainement,
  );
  const plan = useGeneration(
    token,
    id,
    api.createBuildPlan,
    setBuildPlans,
    "Impossible de générer le plan.",
    onGenerated,
  );

  const [financingPlans, setFinancingPlans] = usePlanList<FinancingPlan>(
    token,
    id,
    api.listFinancingPlans,
    lisible("voir_plan_financement"),
    versionEnchainement,
  );
  const financing = useGeneration(
    token,
    id,
    api.createFinancingPlan,
    setFinancingPlans,
    "Impossible de générer le plan de financement.",
    onGenerated,
  );

  const [developmentPlans, setDevelopmentPlans] = usePlanList<DevelopmentPlan>(
    token,
    id,
    api.listDevelopmentPlans,
    lisible("voir_projet"),
    versionEnchainement,
  );
  const development = useGeneration(
    token,
    id,
    api.createDevelopmentPlan,
    setDevelopmentPlans,
    "Impossible de générer le plan de développement.",
    onGenerated,
  );

  const [transmissionPlans, setTransmissionPlans] =
    usePlanList<TransmissionPlan>(
      token,
      id,
      api.listTransmissionPlans,
      lisible("voir_projet"),
    );
  const transmission = useGeneration(
    token,
    id,
    api.createTransmissionPlan,
    setTransmissionPlans,
    "Impossible de générer le plan de transmission.",
    onGenerated,
  );

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    api
      .getProject(token, id)
      .then((data) => {
        if (cancelled) return;
        setProject(data);
        setTitle(data.title);
        setDescription(data.description ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Impossible de charger le projet.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isReady, token, id, router]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateProject(token, id, title, description);
      setProject(updated);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Impossible de sauvegarder.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!token || !project) return;
    // Un seul clic effaçait tout, définitivement. Le serveur refuse de son
    // côté un projet qui a une société immatriculée ou des factures émises,
    // et son message propose d'archiver : on l'affiche tel quel.
    if (
      !window.confirm(
        `Supprimer définitivement « ${project.title} » ? Tout ce qu'il contient sera effacé. ` +
          "Pour le garder sans le voir dans ta liste, choisis plutôt « Archiver le projet ».",
      )
    ) {
      return;
    }
    setFormError(null);
    setIsDeleting(true);
    try {
      await api.deleteProject(token, id);
      router.replace("/projects");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Impossible de supprimer.",
      );
      setIsDeleting(false);
    }
  }

  // Réversible : pas de confirmation, « Restaurer » le défait.
  async function handleArchivage(archiver: boolean) {
    if (!token) return;
    setFormError(null);
    setErreurArchivage(null);
    setIsArchiving(true);
    try {
      setProject(
        archiver
          ? await api.archiveProject(token, id)
          : await api.restoreProject(token, id),
      );
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : archiver
            ? "Impossible d'archiver."
            : "Impossible de restaurer.";
      if (archiver) setFormError(message);
      else setErreurArchivage(message);
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleToggleVisibility() {
    if (!token || !project) return;
    setFormError(null);
    setIsTogglingVisibility(true);
    try {
      const updated = await api.updateProjectVisibility(
        token,
        id,
        !project.is_public,
      );
      setProject(updated);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Impossible de changer la visibilité.",
      );
    } finally {
      setIsTogglingVisibility(false);
    }
  }

  /**
   * Le parcours se relit à chaque signal de rafraîchissement : créer une
   * tâche ou lancer une analyse ouvre des sections, et l'écran doit le
   * refléter tout de suite. Un échec est silencieux — sans parcours, la
   * vue reste utilisable au minimum plutôt que de casser.
   */
  useEffect(() => {
    if (!token || !id) return;
    api
      .getProjectJourney(token, id)
      .then(setParcours)
      .catch(() => setParcours(null));
  }, [token, id, refreshSignal]);

  /**
   * Les questions de profil qui ont un sens ICI.
   *
   * Le serveur décide lesquelles : l'écran ne connaît pas le catalogue et
   * n'a pas à le connaître. Un échec est silencieux — ne pas pouvoir poser
   * une question facultative ne doit pas abîmer la page.
   */
  useEffect(() => {
    if (!token) return;
    api
      .getProfileFieldsToAsk(token, "premier-projet")
      .then(setADemander)
      .catch(() => setADemander([]));
  }, [token, refreshSignal]);

  /**
   * Le questionnaire est-il terminé ? Même règle que les questions de
   * profil : un échec est silencieux, un rappel facultatif ne doit pas
   * abîmer la page.
   */
  useEffect(() => {
    if (!token) return;
    api
      .getQuestionnaire(token, id)
      .then((q) => setQuestionnaireTermine(q.termine))
      .catch(() => setQuestionnaireTermine(null));
  }, [token, id]);

  if (!isReady || !token) {
    return null;
  }

  const isOwner = project ? project.owner_id === user?.id : false;

  /**
   * Ce que le rôle de la personne permet sur ce projet (lu sur le serveur).
   * Tant que ce n'est pas chargé : tout pour le propriétaire, rien de réservé
   * pour les autres (pas de 403 en rafale). Le serveur revérifie tout.
   */
  const peut = (capacite: Capacite): boolean =>
    acces ? acces.capacites.includes(capacite) : isOwner;

  const peutLancerIgini =
    !!project &&
    !project.archived_at &&
    peut("lancer_ia") &&
    // IGINI en pause : la carte n'aurait rien à offrir, le guide habituel
    // dit comment avancer à la main.
    iginiStatus?.generatorsEnabled !== false;

  /**
   * Tant que la prochaine étape du parcours (règle du serveur) est l'analyse
   * et que rien n'est encore sorti, la carte « Lance IGINI sur ton projet »
   * occupe le haut de la fiche, seule : le tableau de bord vide, le guide, les
   * étapes et les questions attendent qu'il y ait quelque chose à suivre.
   */
  const premierPassage =
    peutLancerIgini &&
    !!enchainement &&
    parcours?.nextStep?.id === "analyser" &&
    analyses.length === 0;

  /** La carte reste là tant que ça tourne, après un arrêt, et pour dire « c'est prêt ». */
  const carteIgini =
    peutLancerIgini &&
    !!enchainement &&
    !enchainementMasque &&
    (premierPassage ||
      enchainement.statut === "en-cours" ||
      enchainement.statut === "arrete" ||
      (enchainement.statut === "termine" && enchainementVu));

  /**
   * Une section s'affiche si le parcours l'a ouverte, ou si la vue avancée
   * est demandée. Tant que le parcours n'est pas chargé, on s'en tient à
   * l'essentiel : mieux vaut un écran qui se remplit qu'un écran qui montre
   * tout avant de se replier — ce dernier donnerait exactement la surcharge
   * qu'on cherche à retirer.
   */
  const montrer = (section: string): boolean => {
    if (!project) return false;
    const lecture = lectureDeSection(section);
    if (lecture && !peut(lecture)) return false;
    if (vueAvancee) return true;
    if (section === "transmission" && transmissionDemandee) return true;
    if (!parcours) return section === "analyse";
    return parcours.visible.some((s) => s.section === section);
  };

  /** Quelles icônes « Les outils » proposer — voir OUTILS_PROJET. */
  const outilVisible = (outil: { id: string; section: string }): boolean => {
    // Le formulaire d'édition n'est pas une section du parcours : il est
    // toujours là pour le propriétaire, jamais pour un collaborateur.
    if (outil.id === "infos") return !!project && peut("modifier_projet");
    if (outil.id === "collaborateurs") return montrer(outil.section);
    // Les membres lisent les documents juridiques ici ; le propriétaire les a,
    // complets, dans l'étape « Forme juridique ».
    if (outil.id === "documents-juridiques")
      return !!project && !isOwner && peut("voir_documents_juridiques");
    return montrer(outil.section);
  };

  /** « Y aller » du guide : ouvrir l'étape, puis désigner où agir. */
  const allerA = (etapeId: string) => {
    const destination = destinationDe(etapeId);
    if (!destination) return;
    // « infos » n'est pas une section du parcours : le formulaire est
    // toujours là pour le porteur, la vue simple suffit.
    const visibleEnVueSimple =
      destination.ouvre === "infos"
        ? outilVisible({ id: "infos", section: "infos" })
        : montrer(destination.ouvre);
    if (destination.avancee || !visibleEnVueSimple) setVueAvancee(true);
    setEtapeOuverte(destination.ouvre);
    setCibleGuide({ selecteur: destination.cible, section: destination.ouvre });
  };

  /** Le lien discret du guide : ouvrir la transmission seule, sans la vue avancée. */
  const preparerTransmission = () => {
    const destination = destinationDe("transmettre");
    setTransmissionDemandee(true);
    setEtapeOuverte("transmission");
    if (destination) setCibleGuide({ selecteur: destination.cible, section: destination.ouvre });
  };

  return (
    // Le solde se lit une fois pour toute la fiche, et se relit après chaque
    // génération réussie (`refreshSignal`). Dans le projet d'un autre, ce
    // sont les crédits du propriétaire qui paient : le solde du membre ne
    // bloque rien, le serveur tranche.
    <CreditsProvider
      token={token}
      payeParLeProprietaire={!!project && !isOwner}
      version={refreshSignal}
    >
    <main className="page page--wide">
      <div className="top-bar">
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/projects" className="muted">
            ← Retour aux projets
          </Link>
          {/* Avec un seul projet, « Retour aux projets » ramène directement
              ici (voir projects/page.tsx) — ce lien-ci reste donc le seul
              moyen d'en commencer un second. `?creer=1` évite d'y être
              aussitôt renvoyé par cette même redirection. */}
          <Link href="/projects?creer=1" className="muted">
            + Nouveau projet
          </Link>
        </div>
        {/* L'argent a son propre écran : la fiche projet faisait déjà sept
            mille pixels, et le financement s'y perdait tout en bas. */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {peut("voir_financement") && (
            <Link href={`/projects/${id}/finances`}>
              Financement et investisseurs
            </Link>
          )}
          {/* Le mode par défaut reste simple. La vue avancée est un choix,
              jamais l'état initial : quelqu'un qui arrive ne devrait pas
              avoir à comprendre Ignitux avant de s'en servir. */}
          {isOwner && (
            <button
              className="secondary"
              type="button"
              style={{ width: "auto" }}
              aria-label="Revoir la visite"
              onClick={() => setVisiteOuverte(true)}
            >
              ? Visite
            </button>
          )}
          <button
            className="secondary"
            type="button"
            data-visite="vue-avancee"
            aria-pressed={vueAvancee}
            onClick={() => setVueAvancee((v) => !v)}
          >
            {vueAvancee ? "Revenir au parcours" : "Vue avancée"}
          </button>
        </div>
      </div>

      {isLoading && <p className="loading">Chargement…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {project && (
        <>
          <h1 style={{ marginBottom: "0.75rem" }}>{project.title}</h1>

          {project.archived_at && (
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <p style={{ margin: 0 }}>
                Ce projet est archivé : il n&apos;apparaît plus dans ta liste,
                mais rien n&apos;est perdu.
              </p>
              {erreurArchivage && <p className="error">{erreurArchivage}</p>}
              {peut("supprimer_projet") && (
                <button
                  className="secondary"
                  type="button"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() => void handleArchivage(false)}
                  disabled={isArchiving}
                >
                  {isArchiving ? "Restauration…" : "Restaurer le projet"}
                </button>
              )}
            </div>
          )}

          {carteIgini && enchainement && (
            <LancerIgini
              vue={enchainement}
              lancement={lancementIgini}
              erreur={erreurLancement}
              onLancer={() => void lancerIgini()}
              onMasquer={() => setEnchainementMasque(true)}
              questionnaireHref={
                isOwner && questionnaireTermine === false
                  ? `/projects/${id}/questionnaire`
                  : null
              }
            />
          )}

          {/* Le bandeau disait « les 5 étapes ci-dessous » en montrant quinze
              sections. La progression et la prochaine étape le remplacent :
              elles disent où on en est et quoi faire, ce que la phrase
              générique ne faisait ni l'un ni l'autre. */}
          {/* Les chiffres d'abord : « où en est ce projet ? » se lisait
              jusqu'ici en faisant défiler jusqu'au score, tout en bas. */}
          {parcours && !premierPassage && (
            <div data-visite="reperes">
              <TableauDeBord
                reperes={parcours.reperes}
                /* Deux conditions, et chacune a coûté quelque chose.

                   Réservé au porteur : quelqu'un qui consulte le projet d'un
                   autre n'a pas de tâche à y ajouter, et lui proposer serait
                   promettre une porte qui se refermera.

                   Et seulement tant que la section des tâches n'est pas déjà à
                   l'écran. Sans cette seconde condition, la page portait deux
                   contrôles nommés « Ajouter… » dont un seul agissait — le
                   raccourci de la tuile restait affiché au-dessus du formulaire
                   qu'il venait d'ouvrir. Un raccourci vers un endroit où l'on se
                   trouve déjà n'est plus un raccourci. */
                surTacheVide={
                  peut("modifier_taches") && !montrer("taches")
                    ? () => {
                        setVueAvancee(true);
                        setEtapeOuverte("taches");
                        setAllerAuxTaches(true);
                      }
                    : undefined
                }
              />
            </div>
          )}
          {parcours && !premierPassage && (
            <div data-visite="progression">
              <Progression phase={parcours.phase} />
            </div>
          )}
          {/* Le guide pas à pas pour le porteur. Sans `guide` (serveur pas
              encore à jour pendant un déploiement), l'ancienne carte reste. */}
          {parcours &&
            !premierPassage &&
            peut("modifier_projet") &&
            Array.isArray(parcours.guide) && (
              <GuideParcours
                parcours={parcours}
                iaDisponible={iginiStatus?.generatorsEnabled ?? true}
                onAller={allerA}
                onPreparerTransmission={
                  montrer("transmission") ? undefined : preparerTransmission
                }
              />
            )}
          {parcours &&
            !premierPassage &&
            peut("modifier_projet") &&
            !Array.isArray(parcours.guide) && (
              <ProchaineEtape
                parcours={parcours}
                iaDisponible={iginiStatus?.generatorsEnabled ?? true}
              />
            )}
          {isOwner && (
            <VisiteGuidee
              arrets={ARRETS_VISITE}
              ouverte={visiteOuverte}
              onFermer={fermerVisite}
            />
          )}

          {/* Demandé ici parce que c'est ici que ça sert, pas à
              l'inscription où la personne n'avait encore rien vu. */}
          {/* Avant la première analyse, le questionnaire est proposé dans sa
              carte, en option : il ne passe plus devant elle. */}
          {isOwner && questionnaireTermine === false && !premierPassage && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginTop: 0 }}>Aide IGINI à analyser juste</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Quelques questions à cliquer — ton parcours, ton projet, ton budget — pour
                qu&apos;IGINI parte de ta situation réelle au lieu de la deviner.
              </p>
              <Link className="primary" href={`/projects/${id}/questionnaire`}>
                Compléter les informations
              </Link>
            </div>
          )}
          {isOwner && !premierPassage && (
            <ChampsADemander
              token={token}
              champs={aDemander}
              /* Le titre ne compte pas : le nombre de questions depend de
                 ce qui reste a repondre, et annoncer « deux choses » au-dessus
                 de quatre champs est le genre de petit faux qui use la
                 confiance. Le sous-titre, lui, dit le compte exact. */
              titre="Pour t'accompagner correctement"
              onEnregistre={() => setRefreshSignal((s) => s + 1)}
            />
          )}
          {!parcours && (
            <IginiMention style={{ marginBottom: "1.5rem" }}>
              prépare ton parcours…
            </IginiMention>
          )}

          {/* Le formulaire du propriétaire vit maintenant derrière l'icône
              « Titre et description » (plus bas, avec les outils). Un
              collaborateur garde cette carte courte : elle lui dit pourquoi
              il ne peut rien modifier. */}
          {!isOwner && (
            <div className="card">
              {project.description && (
                <p style={{ marginTop: 0, marginBottom: 0 }}>
                  {project.description}
                </p>
              )}
              <p
                className="muted"
                style={{ marginTop: "0.75rem", marginBottom: 0 }}
              >
                Projet partagé avec toi
                {acces && acces.role !== "proprietaire"
                  ? ` (${ROLE_EQUIPE_LABEL[acces.role]})`
                  : ""}{" "}
                — tu vois et fais ce que ton rôle permet ; le propriétaire garde
                les actes juridiques et l&apos;équipe.
              </p>
            </div>
          )}
        </>
      )}

      {/* Une icône par étape, plutôt que les six empilées avec leur texte
          complet visible en même temps. On choisit laquelle ouvrir ; les
          autres restent fermées jusqu'au prochain clic. */}
      {!premierPassage && ETAPES_PROJET.some((etape) => montrer(etape.section)) && (
        <div
          className="card"
          style={{ marginTop: "1.5rem" }}
          data-visite="etapes"
        >
          <h2 style={{ marginTop: 0 }}>Les étapes</h2>
          <ul
            className="etapes-grille"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {ETAPES_PROJET.filter((etape) => montrer(etape.section)).map(
              (etape) => {
                const active = etapeOuverte === etape.id;
                return (
                  <li key={etape.id}>
                    <button
                      type="button"
                      className="icone"
                      aria-pressed={active}
                      onClick={() =>
                        setEtapeOuverte((courante) =>
                          courante === etape.id ? null : etape.id,
                        )
                      }
                    >
                      <span
                        className="icone__glyphe"
                        data-categorie="creer"
                        aria-hidden="true"
                      >
                        <Icone id={etape.id} />
                      </span>
                      <span className="icone__nom">{etape.label}</span>
                    </button>
                  </li>
                );
              },
            )}
          </ul>
        </div>
      )}

      {montrer("analyse") && etapeOuverte === "analyse" && (
        <GenerationSection
          guideCible="analyse"
          generateur="analyser"
          title="Analyse"
          buttonLabel="Analyser ce projet"
          buttonBusyLabel="Analyse en cours…"
          emptyLabel="Aucune analyse pour l'instant."
          items={analyses}
          isBusy={analysis.isBusy}
          error={analysis.error}
          onGenerate={analysis.generate}
          /* La plus récente est présentée comme un verdict qu'on peut
             discuter ; les précédentes restent en carte, pour comparer une
             idée retravaillée à ce qu'elle était. */
          renderItem={(item) =>
            item.id === analyses[0]?.id ? (
              <AnalyseResultat
                analyse={item}
                key={item.id}
                onCorriger={() => {
                  // Le champ description n'existe que lorsque l'icône
                  // « Titre et description » est ouverte : on l'ouvre d'abord
                  // (ce qui ferme l'analyse), puis on y mène.
                  setEtapeOuverte("infos");
                  window.requestAnimationFrame(() => {
                    const champ = window.document.getElementById("description");
                    champ?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    (champ as HTMLTextAreaElement | null)?.focus();
                  });
                }}
                onContinuer={() => {
                  // La section de construction n'existe dans le DOM que
                  // lorsque son icône est ouverte : on l'ouvre d'abord, et on
                  // ne défile qu'une fois qu'elle est montée.
                  setEtapeOuverte("construction");
                  window.requestAnimationFrame(() => {
                    window.document
                      .getElementById("section-construction")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
              />
            ) : (
              <AnalysisCard analysis={item} key={item.id} />
            )
          }
          /* Quarante à quatre-vingt-dix secondes de silence font croire que
             quelque chose a cassé. On dit ce qui est en cours, sans feindre
             une progression que le modèle ne fournit pas. */
          busyContent={<AnalyseEnCours />}
          readOnly={!peut("lancer_ia")}
          iginiStatus={iginiStatus}
        />
      )}

      {montrer("analyse") && etapeOuverte === "forme-juridique" && (
        <>
          <GenerationSection
            generateur="former"
            title="Forme juridique"
            buttonLabel="Proposer une forme juridique"
            buttonBusyLabel="Recommandation en cours…"
            emptyLabel="Aucune recommandation pour l'instant — « Lancer IGINI sur mon projet » en prépare une juste après l'analyse, ou lance-la toi-même."
            items={legalForms}
            isBusy={legalForm.isBusy}
            error={legalForm.error}
            onGenerate={legalForm.generate}
            renderItem={(item) => (
              <FormeJuridiqueResultat recommandation={item} key={item.id} />
            )}
            readOnly={!peut("lancer_ia")}
            iginiStatus={iginiStatus}
          />
          {/* Les statuts suivent la forme juridique : même étape. Les écrire est
              réservé au propriétaire ; les membres qui ont le droit les lisent
              dans l'outil « Documents juridiques ». */}
          {isOwner && (
            <StatutsSection
              token={token}
              projectId={id}
              confirmedLegalForm={project?.confirmed_legal_form ?? null}
              onFormConfirmed={(form) =>
                setProject((courant) =>
                  courant
                    ? { ...courant, confirmed_legal_form: form }
                    : courant,
                )
              }
              onChanged={() => setVersionStatuts((v) => v + 1)}
            />
          )}
          {/* Le dossier de création suit les statuts ; même règle. */}
          {isOwner && (
            <DossierCreationSection
              token={token}
              projectId={id}
              confirmedLegalForm={project?.confirmed_legal_form ?? null}
              // Deux compteurs qui ne font que croître : leur somme change à
              // chaque changement des statuts comme de l'immatriculation.
              refreshSignal={versionStatuts + versionImmatriculation}
            />
          )}
          {/* L'immatriculation suit le dépôt du dossier ; même règle. */}
          {isOwner && (
            <ImmatriculationSection
              token={token}
              projectId={id}
              // La suggestion (statuts retenus) et l'écriture de capital
              // dépendent des statuts et de la forme : rechargées quand ils changent.
              confirmedLegalForm={project?.confirmed_legal_form ?? null}
              refreshSignal={versionStatuts}
              onChanged={() => setVersionImmatriculation((v) => v + 1)}
            />
          )}
        </>
      )}

      {montrer("construction") && etapeOuverte === "construction" && (
        <GenerationSection
          anchorId="section-construction"
          guideCible="construction"
          generateur="construire"
          title="Plan de construction"
          buttonLabel="Générer un plan"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan pour l'instant."
          items={buildPlans}
          isBusy={plan.isBusy}
          error={plan.error}
          onGenerate={plan.generate}
          renderItem={(item) => <BuildPlanCard plan={item} key={item.id} />}
          readOnly={!peut("lancer_ia")}
          iginiStatus={iginiStatus}
        />
      )}

      {/* Deux sections portaient le même nom : celle-ci, où IGINI rédige un plan,
          et celle du bas, où figure l'argent réellement reçu. En faisant défiler,
          on ne pouvait pas les distinguer. */}
      {montrer("financement") && etapeOuverte === "financement" && (
        <GenerationSection
          generateur="financer"
          title="Plan de financement"
          buttonLabel="Générer un plan de financement"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de financement pour l'instant."
          items={financingPlans}
          isBusy={financing.isBusy}
          error={financing.error}
          onGenerate={financing.generate}
          renderItem={(item) => <FinancingPlanCard plan={item} key={item.id} />}
          readOnly={!peut("lancer_ia")}
          iginiStatus={iginiStatus}
        />
      )}
      {/* Le jugement (« est-ce finançable ? »), séparé du plan ci-dessus qui dit comment financer. */}
      {montrer("financement") && etapeOuverte === "financement" && (
        <EvaluationSection
          token={token}
          projectId={id}
          readOnly={!peut("demander_evaluation")}
        />
      )}

      {montrer("developpement") && etapeOuverte === "developpement" && (
        <GenerationSection
          guideCible="developpement"
          generateur="developper"
          title="Développement"
          buttonLabel="Générer un plan de développement"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de développement pour l'instant."
          items={developmentPlans}
          isBusy={development.isBusy}
          error={development.error}
          onGenerate={development.generate}
          renderItem={(item) => (
            <DevelopmentPlanCard plan={item} key={item.id} />
          )}
          readOnly={!peut("lancer_ia")}
          iginiStatus={iginiStatus}
        />
      )}

      {montrer("transmission") && etapeOuverte === "transmission" && (
        <GenerationSection
          guideCible="transmission"
          generateur="transmettre"
          title="Transmission"
          buttonLabel="Générer un plan de transmission"
          buttonBusyLabel="Génération…"
          emptyLabel="Aucun plan de transmission pour l'instant."
          items={transmissionPlans}
          isBusy={transmission.isBusy}
          error={transmission.error}
          onGenerate={transmission.generate}
          renderItem={(item) => (
            <TransmissionPlanCard plan={item} key={item.id} />
          )}
          readOnly={!peut("lancer_ia")}
          iginiStatus={iginiStatus}
        />
      )}

      {/* Mêmes icônes, pour les outils transverses — score, tâches,
          conformité… Les 4 moteurs d'origine restent en lecture seule pour
          un collaborateur (readOnly) ; la gestion des collaborateurs et le
          déclenchement manuel de l'automatisation restent réservés au
          propriétaire, y compris pour l'icône elle-même. */}
      {OUTILS_PROJET.some(outilVisible) && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Les outils</h2>
          <ul
            className="etapes-grille"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {OUTILS_PROJET.filter(outilVisible).map((outil) => {
              const active = etapeOuverte === outil.id;
              return (
                <li key={outil.id}>
                  <button
                    type="button"
                    className="icone"
                    aria-pressed={active}
                    onClick={() =>
                      setEtapeOuverte((courante) =>
                        courante === outil.id ? null : outil.id,
                      )
                    }
                  >
                    <span
                      className="icone__glyphe"
                      data-categorie="gerer"
                      aria-hidden="true"
                    >
                      <Icone id={outil.id} />
                    </span>
                    <span className="icone__nom">{outil.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {project && peut("modifier_projet") && etapeOuverte === "infos" && (
        <form
          className="card"
          onSubmit={handleSave}
          style={{ marginTop: "1.5rem" }}
        >
          {formError && <p className="error">{formError}</p>}
          <div className="field">
            <label htmlFor="title">Titre</label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button className="primary" type="submit" disabled={isSaving}>
              {isSaving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
            {peut("supprimer_projet") && !project.archived_at && (
              <button
                className="secondary"
                type="button"
                onClick={() => void handleArchivage(true)}
                disabled={isArchiving}
              >
                {isArchiving ? "Archivage…" : "Archiver le projet"}
              </button>
            )}
            {peut("supprimer_projet") && (
              <button
                className="secondary"
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Suppression…" : "Supprimer le projet"}
              </button>
            )}
            <button
              className="secondary"
              type="button"
              onClick={handleToggleVisibility}
              disabled={isTogglingVisibility}
            >
              {isTogglingVisibility
                ? "Mise à jour…"
                : project.is_public
                  ? "Rendre privé"
                  : "Rendre public"}
            </button>
          </div>
          <p
            className="muted"
            style={{ marginTop: "0.75rem", marginBottom: 0 }}
          >
            {project.is_public
              ? "Ce projet est visible dans la communauté."
              : "Ce projet n'est visible que par toi."}
          </p>
        </form>
      )}

      {montrer("score") && etapeOuverte === "score" && (
        <>
          <ScoreSection
            token={token}
            projectId={id}
            refreshSignal={refreshSignal}
          />
          <ScoreHistorySection
            token={token}
            projectId={id}
            refreshSignal={refreshSignal}
          />
        </>
      )}
      {/* Nommée pour que le raccourci de la tuile « Tâches » puisse amener
          ici — voir `allerAuxTaches` plus haut. */}
      {montrer("taches") && etapeOuverte === "taches" && (
        <div id="taches">
          <TasksSection
            token={token}
            projectId={id}
            readOnly={!peut("modifier_taches")}
            refreshSignal={refreshSignal}
            /* Même signal que les générateurs : une tâche cochée à la main
               doit rafraîchir le score et le parcours exactement comme une
               analyse le ferait. Ce qui compte est le changement, pas ce qui
               l'a provoqué. */
            onChanged={onGenerated}
          />
        </div>
      )}
      {montrer("memoire") && etapeOuverte === "memoire" && (
        <MemorySection
          token={token}
          projectId={id}
          readOnly={!peut("modifier_conformite_memoire")}
        />
      )}
      {montrer("connaissances") && etapeOuverte === "connaissances" && (
        <KnowledgeSection
          token={token}
          projectId={id}
          readOnly={!peut("modifier_conformite_memoire")}
          refreshSignal={refreshSignal}
          onChanged={onGenerated}
        />
      )}
      {/* MANDAT — une autorisation que le porteur donne, pas un résultat de générateur IGINI. Propriétaire seulement (assertOwnsProject côté serveur).
          Pas sur un projet qui attend sa première analyse : « vérifie ton
          identité pour signer un mandat » n'a rien à faire à côté d'une idée
          vieille de dix secondes. */}
      {isOwner && !premierPassage && <MandatSection token={token} projectId={id} />}
      {montrer("conformite") && etapeOuverte === "conformite" && (
        <div data-guide-cible="conformite">
          <ComplianceSection
            token={token}
            projectId={id}
            readOnly={!peut("modifier_conformite_memoire")}
          />
        </div>
      )}
      {montrer("automatisation") && etapeOuverte === "automatisation" && (
        <AutomationSection
          token={token}
          projectId={id}
          readOnly={!peut("lancer_ia")}
          refreshSignal={refreshSignal}
        />
      )}
      {montrer("processus") && etapeOuverte === "processus" && (
        <WorkflowSection
          token={token}
          projectId={id}
          readOnly={!peut("modifier_taches")}
          refreshSignal={refreshSignal}
        />
      )}
      {montrer("financement") &&
        peut("voir_financement") &&
        etapeOuverte === "financement-recu" && (
          <FinancingSection
            token={token}
            projectId={id}
            readOnly={!peut("modifier_financement")}
          />
        )}
      {montrer("capital") && etapeOuverte === "capital" && (
        <ParticipationSection
          token={token}
          projectId={id}
          readOnly={!peut("modifier_financement")}
        />
      )}
      {montrer("capital") && etapeOuverte === "capital" && (
        <BuybackSection
          token={token}
          projectId={id}
          readOnly={!peut("modifier_financement")}
        />
      )}
      {project &&
        !isOwner &&
        peut("voir_documents_juridiques") &&
        etapeOuverte === "documents-juridiques" && (
          <DocumentsJuridiquesLecture token={token} projectId={id} />
        )}
      {montrer("collaborateurs") && etapeOuverte === "collaborateurs" && (
        <CollaboratorsSection
          token={token}
          projectId={id}
          peutGerer={peut("gerer_equipe")}
        />
      )}

      {vueAvancee && parcours && <SectionsFermees parcours={parcours} />}
    </main>
    </CreditsProvider>
  );
}

interface GenerationSectionProps<T> {
  /** Pose un identifiant sur la section, pour qu'on puisse y mener. */
  anchorId?: string;
  /** Marque le bouton de génération pour que « Y aller » le fasse pulser. */
  guideCible?: string;
  /** Ce qui s'affiche pendant la génération, à la place du vide. */
  busyContent?: ReactNode;
  /** Le nom de l'action au barème des crédits : son prix s'affiche sous le bouton. */
  generateur: GenerateurIgini;
  title: string;
  buttonLabel: string;
  buttonBusyLabel: string;
  emptyLabel: string;
  items: T[];
  isBusy: boolean;
  error: ErreurIgini | null;
  onGenerate: () => void;
  renderItem: (item: T) => ReactNode;
  /** Un collaborateur peut consulter l'historique, mais pas en générer de nouveau. */
  readOnly?: boolean;
  /**
   * Disponibilité des générateurs, ou `null` tant qu'on ne la connaît pas.
   * Voir `useIginiStatus` : dans le doute, on propose.
   */
  iginiStatus?: IginiStatus | null;
}

function GenerationSection<T>({
  anchorId,
  guideCible,
  busyContent,
  generateur,
  title,
  buttonLabel,
  buttonBusyLabel,
  emptyLabel,
  items,
  isBusy,
  error,
  onGenerate,
  renderItem,
  readOnly = false,
  iginiStatus = null,
}: GenerationSectionProps<T>) {
  // Éteint uniquement sur une réponse explicite du serveur. `null` (pas
  // encore reçue, ou requête échouée) laisse le bouton en place : le
  // serveur reste seul juge, et il refusera proprement s'il le faut.
  const generatorsOff = iginiStatus !== null && !iginiStatus.generatorsEnabled;
  // Le serveur revérifie toujours ; ici, on évite seulement de lancer une
  // demande qu'on sait refusée.
  const prix = usePrixIgini(generateur);

  return (
    <div
      className="card"
      // Sans ancre explicite, « Y aller » mène quand même à la section quand
      // son bouton manque (générateurs éteints).
      id={anchorId ?? (guideCible ? `section-${guideCible}` : undefined)}
      style={{ marginTop: "1.5rem" }}
    >
      <div
        className="top-bar"
        style={{ marginBottom: items.length ? "1rem" : 0 }}
      >
        <h2 style={{ margin: 0 }}>{title}</h2>
        {!readOnly && !generatorsOff && (
          <button
            className="secondary"
            type="button"
            onClick={onGenerate}
            disabled={isBusy || !!prix?.insuffisant}
            data-guide-cible={guideCible}
          >
            {isBusy ? buttonBusyLabel : buttonLabel}
          </button>
        )}
        {!readOnly && generatorsOff && (
          <span className="pill">IA indisponible</span>
        )}
        {/* Sur sa propre ligne, sous le bouton : le prix se lit avant de toucher. */}
        {!readOnly && !generatorsOff && (
          <PrixIgini generateur={generateur} className="prix-igini--ligne" />
        )}
      </div>

      {/* Un encart neutre, pas un message d'erreur rouge : rien n'est
          cassé et rien n'a échoué — la fonctionnalité est éteinte. */}
      {generatorsOff && (
        <p className="notice" style={{ marginTop: items.length ? 0 : "1rem" }}>
          <span>
            {iginiStatus?.unavailableReason ??
              "IGINI est en pause pour le moment : aucune demande n'est envoyée à " +
                "l'IA et aucun crédit n'est débité. Rien n'est cassé."}
          </span>
        </p>
      )}

      <MessageErreurIgini erreur={error} />
      {/* Pendant la génération : ce qui est en cours, plutôt que rien. Un
          écran muet pendant une minute fait croire à une panne. */}
      {isBusy && busyContent}
      {items.length === 0 && !isBusy && !generatorsOff && (
        <p className="muted">{emptyLabel}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}

/**
 * Marqueur de provenance affiché sur chaque contenu produit par un
 * générateur IGINI.
 *
 * La Charte IGINI promet qu'« aucun contenu généré ne soit présenté comme
 * une donnée vérifiée » et qu'il reste « identifiable comme tel dans
 * l'historique du projet ». La provenance existait en base depuis que les
 * colonnes generated_by/generated_model ont été ajoutées, mais rien ne
 * l'affichait : la promesse n'était donc tenue qu'à moitié. Ce marqueur
 * la rend vraie à l'écran.
 *
 * Un modèle inconnu se dit « modèle non tracé » et non « écrit par un
 * humain » : ce sont deux choses différentes, et confondre les deux serait
 * exactement l'erreur que l'article 12 interdit.
 */
function ProvenanceBadge({
  generatedBy,
  generatedModel,
}: {
  generatedBy?: string;
  generatedModel?: string | null;
}) {
  if (generatedBy === "human") {
    return <span className="muted">Saisi par un humain</span>;
  }
  return (
    <span className="muted" title={generatedModel ?? "Modèle non tracé"}>
      Généré par IGINI{generatedModel ? "" : " (modèle non tracé)"}
    </span>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return (
    <div className="project-item" style={{ cursor: "default" }}>
      <div className="top-bar" style={{ marginBottom: "0.5rem" }}>
        <strong>Score de faisabilité : {analysis.feasibility_score}/10</strong>
        <span className="muted">
          {new Date(analysis.created_at).toLocaleString("fr-FR")}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <ProvenanceBadge
          generatedBy={analysis.generated_by}
          generatedModel={analysis.generated_model}
        />
      </p>
      <p>{analysis.summary}</p>
      <ItemList title="Points forts" items={analysis.strengths} />
      <ItemList title="Risques" items={analysis.risks} />
      <ItemList title="Prochaines étapes" items={analysis.next_steps} />
    </div>
  );
}

function BuildPlanCard({ plan }: { plan: BuildPlan }) {
  return (
    <div className="project-item" style={{ cursor: "default" }}>
      <div className="top-bar" style={{ marginBottom: "0.5rem" }}>
        <strong>Délai estimé : {plan.estimated_timeline}</strong>
        <span className="muted">
          {new Date(plan.created_at).toLocaleString("fr-FR")}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <ProvenanceBadge
          generatedBy={plan.generated_by}
          generatedModel={plan.generated_model}
        />
      </p>
      <p>{plan.summary}</p>
      <ItemList title="Jalons" items={plan.milestones} />
      <ItemList title="Ressources clés" items={plan.key_resources} />
    </div>
  );
}

function FinancingPlanCard({ plan }: { plan: FinancingPlan }) {
  return (
    <div className="project-item" style={{ cursor: "default" }}>
      <div className="top-bar" style={{ marginBottom: "0.5rem" }}>
        <strong>Budget estimé : {plan.estimated_budget}</strong>
        <span className="muted">
          {new Date(plan.created_at).toLocaleString("fr-FR")}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <ProvenanceBadge
          generatedBy={plan.generated_by}
          generatedModel={plan.generated_model}
        />
      </p>
      <p>{plan.summary}</p>
      <ItemList title="Sources de financement" items={plan.funding_sources} />
      <ItemList title="Postes de dépense" items={plan.budget_breakdown} />
    </div>
  );
}

function DevelopmentPlanCard({ plan }: { plan: DevelopmentPlan }) {
  return (
    <div className="project-item" style={{ cursor: "default" }}>
      <div className="top-bar" style={{ marginBottom: "0.5rem" }}>
        <strong>Plan de croissance</strong>
        <span className="muted">
          {new Date(plan.created_at).toLocaleString("fr-FR")}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <ProvenanceBadge
          generatedBy={plan.generated_by}
          generatedModel={plan.generated_model}
        />
      </p>
      <p>{plan.summary}</p>
      <ItemList title="Leviers de croissance" items={plan.growth_levers} />
      <ItemList title="Indicateurs clés" items={plan.key_metrics} />
      <ItemList
        title="Risques de passage à l'échelle"
        items={plan.scaling_risks}
      />
    </div>
  );
}

function TransmissionPlanCard({ plan }: { plan: TransmissionPlan }) {
  return (
    <div className="project-item" style={{ cursor: "default" }}>
      <div className="top-bar" style={{ marginBottom: "0.5rem" }}>
        <strong>Plan de transmission</strong>
        <span className="muted">
          {new Date(plan.created_at).toLocaleString("fr-FR")}
        </span>
      </div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <ProvenanceBadge
          generatedBy={plan.generated_by}
          generatedModel={plan.generated_model}
        />
      </p>
      <p>{plan.summary}</p>
      <ItemList title="Options de transmission" items={plan.transfer_options} />
      <ItemList title="À documenter" items={plan.key_documentation} />
      <ItemList
        title="Check-list de préparation"
        items={plan.readiness_checklist}
      />
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <strong>{title}</strong>
      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
