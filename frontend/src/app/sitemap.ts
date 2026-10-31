import type { MetadataRoute } from 'next';

/**
 * /sitemap.xml — les pages qu'un visiteur peut lire sans compte. L'accueil
 * d'abord ; les pages légales et la Constitution ensuite, plus rarement
 * revues.
 */
const PAGES_PUBLIQUES = [
  { chemin: '/', priorite: 1 },
  { chemin: '/signup', priorite: 0.8 },
  { chemin: '/login', priorite: 0.5 },
  { chemin: '/constitution', priorite: 0.5 },
  { chemin: '/cgu', priorite: 0.3 },
  { chemin: '/confidentialite', priorite: 0.3 },
  { chemin: '/mentions-legales', priorite: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES_PUBLIQUES.map(({ chemin, priorite }) => ({
    url: `https://ignitux.com${chemin === '/' ? '' : chemin}`,
    changeFrequency: chemin === '/' ? 'weekly' : 'monthly',
    priority: priorite,
  }));
}
