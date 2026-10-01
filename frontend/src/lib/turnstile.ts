/**
 * Nom du pont entre le widget Cloudflare Turnstile et React — partagé entre
 * l'attribut `data-callback` et l'assignation sur `window` pour qu'un
 * renommage reste une opération vérifiée par le compilateur plutôt qu'un
 * grep-et-prie entre une chaîne JSX et une clé d'objet.
 *
 * Vit ici plutôt que dans `app/signup/page.tsx` : Next.js interdit toute
 * exportation nommée d'un fichier `page.tsx` autre que celles qu'il reconnaît
 * (`default`, `metadata`, etc.) — `next build` refuse de compiler sinon.
 */
export const TURNSTILE_CALLBACK_NAME = 'handleTurnstileToken';
