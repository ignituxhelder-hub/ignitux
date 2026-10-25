'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * L'ANCIENNE PAGE DES OFFRES.
 *
 * Depuis le 2026-10-25 il n'y a plus d'abonnement : tous les outils sont
 * gratuits, seules les actions IGINI se paient, en crédits (voir
 * docs/superpowers/specs/2026-10-25-credits-design.md). Un favori, un lien
 * ancien ou une tâche du bureau qui pointe encore ici mène à « Mes crédits ».
 */
export default function OffresPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/credits');
  }, [router]);

  return (
    <main className="page">
      <h1>Mes crédits</h1>
      <p className="muted">
        Il n’y a plus d’offre à choisir : tout est gratuit, seules les actions d’IGINI se paient
        en crédits. <Link href="/credits">Mes crédits</Link>
      </p>
    </main>
  );
}
