/**
 * Messages envoyés à Claude pour l'exécution : le projet d'abord (sans lui,
 * le modèle ne sait pas de quoi on parle), puis la tâche ou l'exigence, puis
 * — s'il y en a un — la remarque de la personne sur la version précédente.
 * Les intitulés sont fixes ici pour que le motif de refus ne soit jamais
 * présenté comme une connaissance d'IGINI : c'est l'avis du propriétaire.
 */
export interface ProjetPrompt {
  title: string;
  description: string | null;
  sector?: string | null;
}

function bloc(projet: ProjetPrompt): string[] {
  const parts = [
    'Projet :',
    `Titre : ${projet.title}`,
    `Description : ${projet.description ?? '(aucune description fournie)'}`,
  ];
  if (projet.sector) {
    parts.push(`Secteur : ${projet.sector}`);
  }
  return parts;
}

function remarque(motif: string | null | undefined): string[] {
  return motif ? ['', 'Remarque du propriétaire sur la version précédente :', motif] : [];
}

export function promptTache(
  projet: ProjetPrompt,
  tache: { title: string; description: string | null },
  motifRefus?: string | null,
): string {
  return [
    ...bloc(projet),
    '',
    'Tâche à faire :',
    `Titre : ${tache.title}`,
    `Description : ${tache.description ?? '(aucune description fournie)'}`,
    ...remarque(motifRefus),
  ].join('\n');
}

export function promptExigence(
  projet: ProjetPrompt,
  exigence: {
    title: string;
    description: string;
    source_name: string;
    source_url: string;
    country: string;
    category: string;
  },
  motifRefus?: string | null,
): string {
  return [
    ...bloc(projet),
    '',
    'Exigence de conformité :',
    `Titre : ${exigence.title}`,
    `Description : ${exigence.description}`,
    `Source : ${exigence.source_name} (${exigence.source_url})`,
    `Pays : ${exigence.country} — catégorie : ${exigence.category}`,
    ...remarque(motifRefus),
  ].join('\n');
}
