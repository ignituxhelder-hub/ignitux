import Link from 'next/link';
import { Brand } from '@/components/ignitux-mark';

export const metadata = {
  title: 'Mentions légales — Ignitux',
};

/**
 * LES MENTIONS LÉGALES.
 *
 * Helder édite Ignitux à titre personnel, salarié par ailleurs, sans
 * structure commerciale à ce jour — d'où « personne physique » plutôt
 * qu'une raison sociale inventée. Validé par Helder le 2026-09-30 ; section
 * hébergement complétée le 2026-10-01 une fois Render choisi comme hébergeur
 * backend (Vercel pour le frontend était déjà la décision de Helder, voir
 * docs/deploiement-v1.md) — voir docs/superpowers/plans/2026-09-30-v1-test-prive.md,
 * Tâche 4.
 */
export default function MentionsLegalesPage() {
  return (
    <main className="page">
      <div className="top-bar">
        <Link href="/account" className="muted">
          ← Retour à Mon compte
        </Link>
      </div>
      <Brand />
      <h1>Mentions légales</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Éditeur</h2>
        <p style={{ marginBottom: 0 }}>
          Ignitux est édité par Helder Simões, personne physique.
          <br />
          28 avenue de la Route Blanche, 74950 Scionzier, France
          <br />
          Contact : ignitux@outlook.com
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Hébergement</h2>
        <p>
          Backend : Render Services, Inc., 525 Brannan Street Ste 300, San Francisco, CA
          94107, États-Unis — render.com
        </p>
        <p style={{ marginBottom: 0 }}>
          Frontend : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis —
          vercel.com
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Propriété intellectuelle</h2>
        <p style={{ marginBottom: 0 }}>
          Le nom Ignitux, la marque IGINI et le contenu du site sont la propriété de
          l&apos;éditeur. Les contenus que tu crées (projets, textes, résultats des
          générateurs) restent les tiens.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Données personnelles</h2>
        <p style={{ marginBottom: 0 }}>
          Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </div>
    </main>
  );
}
