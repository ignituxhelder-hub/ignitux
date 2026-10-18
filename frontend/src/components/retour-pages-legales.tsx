'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

/**
 * LE LIEN DE RETOUR DES PAGES LÉGALES — CGU, confidentialité, mentions.
 *
 * Ces pages se lisent connecté (depuis Mon compte) comme sans compte (depuis
 * l'accueil ou l'inscription). « Retour à Mon compte » envoyait un visiteur
 * vers une page qui lui demande de se connecter : sans session, le retour
 * mène à l'accueil.
 *
 * Tant que la session n'est pas lue (rendu serveur, premier rendu), c'est
 * l'accueil : la page ne promet pas un compte qu'elle n'a pas encore vu.
 */
export function RetourPagesLegales() {
  const { token, isReady } = useAuth();

  if (isReady && token) {
    return (
      <Link href="/account" className="muted">
        ← Retour à Mon compte
      </Link>
    );
  }

  return (
    <Link href="/" className="muted">
      ← Retour à l&apos;accueil
    </Link>
  );
}
