import Link from 'next/link';
import { Brand } from '@/components/ignitux-mark';

export const metadata = {
  title: 'Politique de confidentialité — Ignitux',
};

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ PUBLIQUE.
 *
 * Écrite à partir de ce que le code fait réellement
 * (docs/registre-de-traitements.md, dérivé table par table du schéma) — pas
 * un modèle générique. Validée par Helder le 2026-09-30 (identité et texte) —
 * voir docs/superpowers/plans/2026-09-30-v1-test-prive.md, Tâche 4.
 */
export default function ConfidentialitePage() {
  return (
    <main className="page">
      <div className="top-bar">
        <Link href="/account" className="muted">
          ← Retour à Mon compte
        </Link>
      </div>
      <Brand />
      <h1>Politique de confidentialité</h1>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          <strong>Version test.</strong> Ignitux est en phase de test privé, sur invitation,
          pas encore un produit commercial public. Ce texte sera revu avant toute ouverture
          plus large.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Qui traite tes données</h2>
        <p>
          Ignitux est édité par Helder Simões, personne physique, 28 avenue de la Route
          Blanche, 74950 Scionzier, France. Contact : ignitux@outlook.com. Helder est
          responsable du traitement de tes données de compte et du fonctionnement du
          service.
        </p>
        <p style={{ marginBottom: 0 }}>
          Pour les coordonnées de tiers que tu saisis toi-même dans Ignitux (contacts CRM,
          détenteurs de parts, destinataires d&apos;un message), Ignitux agit comme
          sous-traitant : c&apos;est toi qui décides de leur collecte et qui en réponds.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Quelles données, et pourquoi</h2>
        <p>Ignitux traite, dans le seul but de faire fonctionner le service :</p>
        <ul>
          <li>
            <strong>Ton compte</strong> — email, mot de passe (jamais en clair), rôles tenus,
            applications activées sur ton bureau, offre souscrite.
          </li>
          <li>
            <strong>Tes projets et leur contenu</strong> — ce que tu écris, les tâches, la
            mémoire et le suivi de processus liés à chaque projet.
          </li>
          <li>
            <strong>Les résultats des générateurs IGINI</strong> que tu demandes
            explicitement (Analyser, Former, Construire, Financer, Développer, Transmettre) —
            enregistrés pour que tu les retrouves dans ton historique.
          </li>
          <li>
            <strong>Tes relations professionnelles</strong> — si tu utilises le CRM, la
            facturation, la comptabilité ou la banque : uniquement ce que toi-même y saisis.
          </li>
          <li>
            <strong>La consommation de l&apos;IA</strong> — quel générateur, quand, et son
            coût, pour t&apos;en montrer le détail et respecter les limites de la bêta.
          </li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Rien n&apos;est revendu, ni utilisé à des fins publicitaires. Aucune donnée n&apos;est
          utilisée pour entraîner un modèle d&apos;IA.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Qui reçoit ces données</h2>
        <p style={{ marginBottom: 0 }}>
          Personne d&apos;autre que toi ne voit tes données à travers Ignitux. Pour faire
          fonctionner le service, trois prestataires y ont un accès technique, strictement
          nécessaire :
        </p>
        <ul style={{ marginBottom: 0 }}>
          <li>
            <strong>Anthropic</strong> (au moment où tu utilises un générateur IGINI, pour
            produire le résultat demandé) ;
          </li>
          <li>
            <strong>l&apos;hébergeur de la base de données</strong> (où tes données sont
            stockées) ;
          </li>
          <li>
            <strong>l&apos;hébergeur technique</strong> du site et du serveur.
          </li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Combien de temps</h2>
        <p style={{ marginBottom: 0 }}>
          Tes données sont conservées tant que ton compte existe. Si tu le supprimes, tout
          part immédiatement et intégralement — sans période de grâce, sans copie de
          sauvegarde conservée par Ignitux. Deux exceptions, limitées à ce qui protège les
          tiers concernés : les mouvements financiers réellement engagés dans un projet
          financé par quelqu&apos;un d&apos;autre restent (ton identité, elle, en est
          détachée), et le suivi de consommation IA déjà facturé est conservé anonymisé.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Tes droits</h2>
        <p style={{ marginBottom: 0 }}>
          Accès, rectification, effacement, portabilité : tout se fait depuis{' '}
          <Link href="/account">Mon compte</Link>, sans avoir à nous écrire. Le bouton
          « Mes données » télécharge l&apos;intégralité de ce qu&apos;Ignitux sait de toi ;
          « Supprimer mon compte » l&apos;efface définitivement, après t&apos;avoir montré
          précisément ce qui va disparaître.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Cookies et stockage local</h2>
        <p style={{ marginBottom: 0 }}>
          Ignitux ne pose aucun cookie et ne fait tourner aucun script de suivi. La connexion
          (ton jeton de session) est mémorisée uniquement dans le stockage local de ton
          navigateur, sur cet appareil.
        </p>
      </div>
    </main>
  );
}
