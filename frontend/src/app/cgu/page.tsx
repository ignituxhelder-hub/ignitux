import Link from 'next/link';
import { Brand } from '@/components/ignitux-mark';
import { RetourPagesLegales } from '@/components/retour-pages-legales';
import { CGU_VERSION } from '@/lib/cgu';

export const metadata = {
  title: 'Conditions d’utilisation',
};

/**
 * LES CONDITIONS D'UTILISATION — OUVERTURE PUBLIQUE, CRÉDITS IGINI.
 *
 * Version du 2026-10-25 (`CGU_VERSION`) : l'abonnement Entrepreneur a
 * disparu, les actions IGINI se paient en crédits
 * (docs/superpowers/specs/2026-10-25-credits-design.md). Seuls « Objet » et
 * la nouvelle section « Le prix : des crédits pour IGINI » changent ; le reste
 * est le texte validé par Helder le 2026-10-01 (qui remplaçait la version
 * « test privé » du 2026-09-30). Les règles de recharge et de remboursement
 * ne sont volontairement pas écrites : elles seront fixées avant l'ouverture
 * du paiement par carte.
 */
export default function CguPage() {
  return (
    <main className="page">
      <div className="top-bar">
        <RetourPagesLegales />
      </div>
      <Brand />
      <h1>Conditions d&apos;utilisation</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Objet</h2>
        <p style={{ marginBottom: 0 }}>
          Ces conditions régissent l&apos;accès à Ignitux et à IGINI, ouverts à toute
          personne qui crée un compte. Il n&apos;y a pas d&apos;abonnement : les outils sont
          gratuits, seules les actions d&apos;IGINI se paient, en crédits (voir « Le prix : des
          crédits pour IGINI » ci-dessous). Le produit reste en développement actif — voir
          « Ce que tu peux attendre du service » ci-dessous.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Le prix : des crédits pour IGINI</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>
            Les outils d&apos;Ignitux — projets, comptabilité, facturation, banque, caisse, stocks,
            agenda, contacts, équipe, financement, documents juridiques — sont gratuits, sans
            abonnement.
          </li>
          <li>
            Seules les actions d&apos;IGINI (les appels à l&apos;intelligence artificielle :
            analyses, plans, statuts, démarches, évaluations, messages au chat…) se paient, en
            crédits. 1 crédit vaut 0,10 € TTC.
          </li>
          <li>
            Le prix de chaque action, en crédits, est affiché avant que tu la lances, et c&apos;est
            ce prix qui est débité. Si IGINI échoue, rien n&apos;est débité.
          </li>
          <li>30 crédits sont offerts à l&apos;inscription, une seule fois par compte.</li>
          <li>
            Quand un membre de ton équipe lance une action IGINI dans ton projet, ce sont tes
            crédits qui sont utilisés.
          </li>
          <li>
            Ignitux peut ajouter des crédits à ton compte ou corriger ton solde ; chaque mouvement
            apparaît, avec son motif, dans « Mes crédits ».
          </li>
          <li>Dans cette version, les crédits n&apos;expirent pas.</li>
          <li>
            Aucun moyen de paiement n&apos;est encore en place : les crédits ne peuvent pas encore
            être achetés. Les conditions de recharge et de remboursement seront précisées avant
            l&apos;ouverture du paiement par carte.
          </li>
        </ul>
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

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
        Version en vigueur : {CGU_VERSION}.
      </p>
    </main>
  );
}
