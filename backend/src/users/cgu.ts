/**
 * LA VERSION DES CONDITIONS D'UTILISATION EN VIGUEUR — au seul endroit où
 * le serveur la connaît.
 *
 * C'est la date du texte publié sur /cgu (frontend src/app/cgu/page.tsx, qui
 * l'affiche en bas de page). 2026-10-25 : les crédits IGINI remplacent
 * l'abonnement Entrepreneur (le texte de l'ouverture publique, validé par
 * Helder le 2026-10-01, portait « 2026-10-01 »). Une date plutôt qu'un
 * numéro : elle se relit sans table de correspondance.
 *
 * Les comptes créés avant gardent en base la version qu'ils ont acceptée
 * (`users.cgu_version`) : rien ne leur redemande d'accepter la nouvelle.
 *
 * Le jour où les CGU changent : modifier le texte, puis cette constante ET
 * son miroir côté interface (frontend/src/lib/cgu.ts). L'inscription refuse
 * toute autre version que celle-ci — une personne dont la page date d'avant
 * le changement est invitée à recharger, donc à relire ce qu'elle accepte.
 */
export const CGU_VERSION_EN_VIGUEUR = '2026-10-25';
