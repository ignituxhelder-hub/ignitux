/**
 * Les types de souvenirs qu'IGINI peut retenir. Volontairement en tableau
 * validé au niveau DTO (pas un enum Prisma), pour rester cohérent avec le
 * reste du schéma qui suit la même convention.
 */
/**
 * « error » n'est pas un doublon de « learning », et la distinction est ce
 * qui permet à IGINI d'apprendre vraiment :
 *
 * — un **apprentissage** est la conclusion qu'on a tirée, déjà digérée ;
 * — une **erreur** est ce qui s'est produit, avant toute conclusion.
 *
 * Les deux se ressemblent après coup, et c'est exactement le piège : « j'ai
 * appris qu'il faut valider le prix avant de produire » efface « j'ai
 * produit 200 pièces invendables ». La première phrase se range et
 * s'oublie ; la seconde se reconnaît quand la situation se représente.
 *
 * Une erreur n'est jamais déduite par le produit. C'est la personne qui
 * décide de nommer quelque chose ainsi — Ignitux n'a pas à qualifier
 * d'erreur ce qu'elle considère peut-être comme un détour.
 */
export const MEMORY_CATEGORIES = [
  'decision',
  'preference',
  'learning',
  'fact',
  'error',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
