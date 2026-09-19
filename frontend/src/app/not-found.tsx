import Link from 'next/link';
import { Brand } from '@/components/ignitux-mark';

export const metadata = {
  title: 'Page introuvable — Ignitux',
};

/**
 * Ce que voit quelqu'un qui se trompe d'adresse.
 *
 * Sans ce fichier, Next sert sa page par défaut : « 404: This page could
 * not be found. » — en anglais, sans style, dans un produit français.
 * Pour une personne qui teste, ce n'est pas seulement laid : ça ressemble
 * à une panne, alors qu'elle a juste tapé une adresse de travers.
 *
 * On ne s'excuse pas et on ne dramatise pas. On dit ce qui s'est passé,
 * et on donne la sortie.
 */
export default function NotFound() {
  return (
    <main className="page">
      <Brand />
      <h1>Cette page n&apos;existe pas</h1>
      <p className="muted">
        L&apos;adresse demandée ne correspond à rien dans Ignitux. Ce n&apos;est pas une panne —
        le lien est probablement incomplet, ou la page a changé de nom.
      </p>
      <div className="hero-actions">
        <Link href="/projects">
          <button className="primary" type="button" style={{ width: 'auto' }}>
            Retour à mes projets
          </button>
        </Link>
        <Link href="/" className="muted" style={{ alignSelf: 'center' }}>
          Aller à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
