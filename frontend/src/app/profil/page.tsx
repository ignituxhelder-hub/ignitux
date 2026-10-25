'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { Icone } from '@/components/icones';
import { useAuth } from '@/lib/auth';

/**
 * MON PROFIL, RANGÉ EN ICÔNES.
 *
 * Même idée que le dossier Entreprise du bureau : plutôt qu'un long
 * formulaire, des icônes qui disent où aller — ce qu'Ignitux sait de soi,
 * l'identité, les rôles, les crédits, la consommation, le compte, le cadre légal.
 * Le formulaire de réponses n'a pas disparu : il est derrière « Mes
 * informations ».
 */
const ICONES_PROFIL: readonly {
  id: string;
  nom: string;
  route: string;
  glyphe: string;
  categorie: string;
}[] = [
  { id: 'informations', nom: 'Mes informations', route: '/profil/informations', glyphe: 'profil', categorie: 'creer' },
  { id: 'identite', nom: 'Mon identité', route: '/identite', glyphe: 'conformite', categorie: 'gerer' },
  { id: 'roles', nom: 'Mes rôles', route: '/roles', glyphe: 'collaborateurs', categorie: 'reseau' },
  { id: 'credits', nom: 'Mes crédits', route: '/credits', glyphe: 'offres', categorie: 'vendre' },
  { id: 'ia', nom: 'Consommation IA', route: '/consommation-ia', glyphe: 'consommation-ia', categorie: 'investir' },
  { id: 'compte', nom: 'Mon compte', route: '/account', glyphe: 'compte', categorie: 'reglages' },
  { id: 'confidentialite', nom: 'Confidentialité', route: '/confidentialite', glyphe: 'conformite', categorie: 'reglages' },
  { id: 'cgu', nom: 'Conditions', route: '/cgu', glyphe: 'constitution', categorie: 'reglages' },
];

export default function ProfilPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && !token) router.replace('/login');
  }, [isReady, token, router]);

  if (!isReady || !token) return null;

  return (
    <main className="page ecran-accueil">
      <div className="top-bar">
        <Brand />
      </div>
      <Link href="/accueil" className="secondary" style={{ display: 'inline-block', width: 'auto' }}>
        ← Bureau
      </Link>
      <h1 className="ecran-accueil__titre" style={{ marginTop: '1rem' }}>
        Mon profil
      </h1>

      <ul className="accueil-page" aria-label="Mon profil">
        {ICONES_PROFIL.map((i) => (
          <li key={i.id}>
            <Link href={i.route} className="icone">
              <span className="icone__glyphe" data-categorie={i.categorie} aria-hidden="true">
                <Icone id={i.glyphe} />
              </span>
              <span className="icone__nom">{i.nom}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
