/**
 * CE QU'IGINI SAIT DE LA PERSONNE — et la règle qui l'empêche d'en dire trop.
 *
 * Module pur : un profil entre, un paragraphe sort. Aucune base, aucun Nest.
 *
 * ## Des faits, jamais ce qu'ils impliquent
 *
 * C'est la seule règle de ce fichier, et elle mérite d'être dite avant le
 * code. Le bloc écrit « a travaillé dans le ferroviaire ». Il n'écrit pas
 * « son expérience terrain réduit les risques opérationnels ».
 *
 * La première phrase est une déclaration de la personne. La seconde est un
 * jugement — peut-être juste, peut-être faux : dix ans de conduite de train
 * ne disent rien de la capacité à tenir une trésorerie. Si ce jugement doit
 * être posé, c'est au modèle de le poser en raisonnant, avec le droit de
 * conclure l'inverse. Le glisser dans le contexte reviendrait à lui souffler
 * sa conclusion, puis à la lui faire répéter comme si elle venait de lui.
 *
 * Concrètement : aucune phrase de ce module ne contient « donc », « réduit »,
 * « augmente » ou « favorise ». Un test le vérifie.
 *
 * ## Le silence plutôt que le remplissage
 *
 * Un profil vide rend `null`, pas « aucune information disponible sur
 * l'utilisateur ». Une phrase pareille occupe de la place dans le contexte,
 * se paie en tokens, et pousse le modèle à commenter une absence au lieu
 * d'analyser le projet.
 */

/** Ce que le contexte sait lire. Un sous-ensemble de `user_profiles`. */
export interface ProfilLu {
  display_name?: string | null;
  activity_country?: string | null;
  sectors?: string[] | null;
  experience?: string | null;
  availability?: string | null;
  /**
   * « Oui » ou « Non » — une chaîne, parce que le champ est un choix et non
   * une case à cocher. La distinction compte : `null` veut dire « pas
   * demandé », et ce troisième état doit rester lisible.
   */
  has_founded_before?: string | null;
  risk_level?: string | null;
  investment_horizon?: string | null;
  skills?: string[] | null;
}

/** Nombre de projets déjà portés, pour situer la personne dans son parcours. */
export interface HistoriquePersonne {
  projetsPortes: number;
}

function nettoyer(valeur: string | null | undefined): string | null {
  const propre = valeur?.trim();
  return propre && propre.length > 0 ? propre : null;
}

function liste(valeurs: string[] | null | undefined): string | null {
  const propres = (valeurs ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  return propres.length > 0 ? propres.join(', ') : null;
}

/**
 * Le bloc de contexte, ou `null` quand il n'y a rien à dire.
 *
 * L'ordre suit ce qui pèse sur une analyse : d'abord le métier et le pays,
 * qui changent les risques réels ; ensuite le temps disponible, qui change
 * ce qui est tenable ; enfin le passé entrepreneurial.
 */
export function contextePersonne(
  profil: ProfilLu | null | undefined,
  historique?: HistoriquePersonne,
): string | null {
  if (!profil) return null;

  const lignes: string[] = [];

  const secteurs = liste(profil.sectors);
  if (secteurs) lignes.push(`A déjà travaillé dans : ${secteurs}.`);

  const competences = liste(profil.skills);
  if (competences) lignes.push(`Compétences déclarées : ${competences}.`);

  const parcours = nettoyer(profil.experience);
  // Tronqué : un parcours de trois pages déséquilibrerait le contexte au
  // détriment du projet lui-même, qui reste le sujet de l'analyse.
  if (parcours) {
    lignes.push(
      `Parcours, dans ses mots : ${parcours.length > 400 ? `${parcours.slice(0, 400)}…` : parcours}`,
    );
  }

  const pays = nettoyer(profil.activity_country);
  if (pays) lignes.push(`Activité prévue en : ${pays}.`);

  const disponibilite = nettoyer(profil.availability);
  if (disponibilite) lignes.push(`Temps qu'elle peut y consacrer : ${disponibilite}.`);

  // Trois états qui comptent : oui, non, et « pas demandé ». Écrire
  // « n'a jamais créé d'entreprise » sur un `null` serait inventer une
  // réponse à une question qu'on n'a peut-être jamais posée.
  const dejaCree = nettoyer(profil.has_founded_before)?.toLowerCase();
  if (dejaCree === 'oui') lignes.push('A déjà créé une entreprise.');
  if (dejaCree === 'non') lignes.push("N'a pas encore créé d'entreprise.");

  const risque = nettoyer(profil.risk_level);
  if (risque) lignes.push(`Niveau de risque qu'elle dit accepter : ${risque}.`);

  const horizon = nettoyer(profil.investment_horizon);
  if (horizon) lignes.push(`Horizon qu'elle vise : ${horizon}.`);

  // Le nombre de projets n'est pas déclaré : il est compté. On le dit
  // au-delà du premier, sinon la phrase « a porté 1 projet » décrirait
  // celui qu'on est en train d'analyser.
  if (historique && historique.projetsPortes > 1) {
    lignes.push(`A déjà ouvert ${historique.projetsPortes} projets sur Ignitux.`);
  }

  if (lignes.length === 0) return null;

  return [
    'Ce que la personne a déclaré sur elle-même (des faits, pas des conclusions — ' +
      "c'est à toi d'en tirer ce qui vaut, y compris rien) :",
    ...lignes.map((l) => `- ${l}`),
  ].join('\n');
}
