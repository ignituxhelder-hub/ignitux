import type { MetadataRoute } from 'next';

/**
 * /robots.txt — tout le site public est lisible par les moteurs de
 * recherche. Les écrans d'un compte (bureau, projets, administration…) ne
 * montrent rien sans connexion : ils sont écartés pour que Google n'indexe
 * pas des pages vides.
 */
const PAGES_PRIVEES = ['/accueil', '/projects', '/account', '/administration', '/credits'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PAGES_PRIVEES },
    sitemap: 'https://ignitux.com/sitemap.xml',
  };
}
