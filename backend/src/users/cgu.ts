/**
 * LA VERSION DES CONDITIONS D'UTILISATION EN VIGUEUR — au seul endroit où
 * le serveur la connaît.
 *
 * C'est la date de validation du texte publié sur /cgu (frontend
 * src/app/cgu/page.tsx : « Validé par Helder le 2026-10-01 », la version de
 * l'ouverture publique). Une date plutôt qu'un numéro : c'est ce que le texte
 * affiche lui-même, et elle se relit sans table de correspondance.
 *
 * Le jour où les CGU changent : modifier le texte, puis cette constante ET
 * son miroir côté interface (frontend/src/lib/cgu.ts). L'inscription refuse
 * toute autre version que celle-ci — une personne dont la page date d'avant
 * le changement est invitée à recharger, donc à relire ce qu'elle accepte.
 */
export const CGU_VERSION_EN_VIGUEUR = '2026-10-01';
