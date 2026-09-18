/**
 * Les types de souvenirs qu'IGINI peut retenir. Volontairement en tableau
 * validé au niveau DTO (pas un enum Prisma), pour rester cohérent avec le
 * reste du schéma qui suit la même convention.
 */
export const MEMORY_CATEGORIES = ['decision', 'preference', 'learning', 'fact'] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
