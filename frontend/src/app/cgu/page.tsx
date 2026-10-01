import Link from 'next/link';
import { Brand } from '@/components/ignitux-mark';

export const metadata = {
  title: 'Conditions d’utilisation — Ignitux',
};

/**
 * LES CONDITIONS D'UTILISATION — OUVERTURE PUBLIQUE.
 *
 * Validé par Helder le 2026-10-01. Remplace la version « test privé »
 * validée le 2026-09-30 (voir docs/superpowers/plans/2026-09-30-v1-test-prive.md,
 * Tâche 4), devenue inexacte : l'accès n'est plus sur invitation.
 */
export default function CguPage() {
  return (
    <main className="page">
      <div className="top-bar">
        <Link href="/account" className="muted">
          ← Retour à Mon compte
        </Link>
      </div>
      <Brand />
      <h1>Conditions d&apos;utilisation</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Objet</h2>
        <p style={{ marginBottom: 0 }}>
          Ces conditions régissent l&apos;accès à Ignitux et à IGINI, ouverts à toute
          personne qui crée un compte. L&apos;offre Découverte, gratuite, est accordée par
          défaut ; les offres payantes (Entrepreneur, Construction) seront proposées dès
          qu&apos;un moyen de paiement sera activé. Le produit reste en développement actif —
          voir « Ce que tu peux attendre du service » ci-dessous.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ce que tu peux attendre du service</h2>
        <p style={{ marginBottom: 0 }}>
          Ignitux est un produit jeune, en développement actif. Le service peut être
          interrompu, modifié ou redémarré sans préavis, et Ignitux ne garantit ni sa
          disponibilité ni sa continuité. Un bug ou une perte de données restent possibles :
          garde une copie de ce qui t&apos;importe (export disponible depuis{' '}
          <Link href="/account">Mon compte</Link>).
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ce qu&apos;IGINI te propose</h2>
        <p style={{ marginBottom: 0 }}>
          Les recommandations d&apos;IGINI (forme juridique, analyses, plans financiers,
          plans de développement ou de transmission) sont{' '}
          <strong>
            indicatives, générées par IA, et ne remplacent pas l&apos;avis d&apos;un
            professionnel (comptable, avocat, expert-comptable)
          </strong>
          . IGINI recommande, il ne décide pas — vérifie toujours une recommandation
          importante avant d&apos;agir dessus.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ce qu&apos;on attend de toi</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>Ne partage pas tes identifiants : ton compte t&apos;est personnel.</li>
          <li>
            N&apos;utilise pas Ignitux pour des données que tu n&apos;as pas le droit de
            traiter (celles de tiers exigent leur accord, quand la loi le demande).
          </li>
          <li>
            Signale les bugs et les comportements inattendus — ça aide à améliorer le
            produit.
          </li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Fin d&apos;accès</h2>
        <p style={{ marginBottom: 0 }}>
          Tu peux supprimer ton compte à tout moment, sans justification, depuis{' '}
          <Link href="/account">Mon compte</Link>. Ignitux peut aussi mettre fin à ton accès ;
          dans ce cas, tu seras prévenu et pourras récupérer tes données avant leur
          suppression.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Tes données</h2>
        <p style={{ marginBottom: 0 }}>
          Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </div>
    </main>
  );
}
