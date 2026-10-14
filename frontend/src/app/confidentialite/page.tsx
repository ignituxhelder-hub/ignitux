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
 * un modèle générique.
 *
 * Validé par Helder le 2026-10-01 pour l'ouverture publique. L'identité et
 * la structure du texte avaient déjà été validées le 2026-09-30 pour la
 * version « test privé » (voir docs/superpowers/plans/2026-09-30-v1-test-prive.md,
 * Tâche 4) ; seul le passage sur le statut du produit a changé.
 *
 * Mise à jour du 2026-10-11 : adresse de contact contact@ignitux.com ;
 * vérification d'identité, mandats (signature suspendue), statuts, dossier de
 * création, immatriculation, évaluation de financement, boutique Shopify,
 * acceptation des CGU et rapports d'erreur ajoutés ; prestataires nommés un
 * par un avec leur pays ; cookie de langue signalé. Rien n'y est affirmé que
 * le code ou la configuration documentée ne fasse réellement — en
 * particulier, aucune durée de conservation n'est annoncée là où le code
 * n'en applique pas.
 *
 * Mise à jour du 2026-10-14 : durée de conservation du journal d'activité
 * des membres d'une équipe (12 mois, purge automatique côté serveur).
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
      <p className="muted">Dernière mise à jour : 14 octobre 2026</p>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          <strong>Produit en développement actif.</strong> Ignitux est un produit jeune,
          ouvert au public. Ce texte reflète ce que le service fait réellement aujourd&apos;hui
          et sera mis à jour si cela change.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Qui traite tes données</h2>
        <p>
          Ignitux est édité par Helder Simões, personne physique, 28 avenue de la Route
          Blanche, 74950 Scionzier, France. Contact : contact@ignitux.com. Helder est
          responsable du traitement de tes données de compte et du fonctionnement du
          service.
        </p>
        <p style={{ marginBottom: 0 }}>
          Pour les coordonnées de tiers que tu saisis toi-même dans Ignitux (contacts CRM,
          détenteurs de parts, associés indiqués dans des statuts, destinataires d&apos;un
          message), Ignitux agit comme sous-traitant : c&apos;est toi qui décides de leur
          collecte et qui en réponds.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Quelles données, et pourquoi</h2>
        <p>Ignitux traite, dans le seul but de faire fonctionner le service :</p>
        <ul>
          <li>
            <strong>Ton compte</strong> — email, mot de passe (jamais en clair), rôles tenus,
            applications activées sur ton bureau, offre souscrite, ainsi que la date et la
            version des conditions d&apos;utilisation que tu as acceptées à l&apos;inscription
            (enregistrées depuis le 11 octobre 2026), pour garder la trace de ce que tu as
            accepté.
          </li>
          <li>
            <strong>Ton profil, si tu le remplis</strong> — nom affiché, pays, secteurs,
            parcours, compétences, disponibilité… pour que les analyses d&apos;IGINI tiennent
            compte de ta situation.
          </li>
          <li>
            <strong>Tes projets et leur contenu</strong> — ce que tu écris, les tâches, la
            mémoire et le suivi de processus liés à chaque projet, et, si tu les utilises, le
            dossier de création et la fiche d&apos;immatriculation (SIREN, siège,
            dénomination…) que tu remplis toi-même.
          </li>
          <li>
            <strong>Les résultats d&apos;IGINI et tes conversations avec lui</strong> — les
            générateurs que tu demandes explicitement (Analyser, Former, Construire, Financer,
            Développer, Transmettre), les projets de statuts, ta conversation avec IGINI et,
            pour une analyse, les pages web qu&apos;il a consultées — enregistrés pour que tu
            les retrouves dans ton historique.
          </li>
          <li>
            <strong>L&apos;évaluation de financement, si tu la demandes</strong> — le rapport
            rédigé par IGINI à partir des données de ton projet. Un administrateur
            d&apos;Ignitux le relit, peut le corriger, puis le valide avant qu&apos;il ne te
            soit remis ; chaque correction est enregistrée.
          </li>
          <li>
            <strong>Ta vérification d&apos;identité, si tu la fais</strong> — les photos de ta
            pièce d&apos;identité (recto, et verso selon le document), son type, et ce qui en
            est lu automatiquement : numéro du document, date de naissance, date
            d&apos;expiration, résultat des contrôles. Cette lecture se fait sur le serveur
            d&apos;Ignitux, avec un logiciel libre de reconnaissance de texte (Tesseract),
            sans service extérieur. Un administrateur d&apos;Ignitux regarde ensuite la pièce
            et valide ou refuse ; sa décision et sa date sont enregistrées.
          </li>
          <li>
            <strong>Tes mandats</strong> — la signature de nouveaux mandats est aujourd&apos;hui
            suspendue. Pour un mandat déjà signé, Ignitux conserve le texte exact que tu as
            lu, le nom que tu as retapé, la date et l&apos;heure, et l&apos;adresse IP de la
            signature. Tu peux le révoquer à tout moment.
          </li>
          <li>
            <strong>Tes relations professionnelles</strong> — si tu utilises le CRM, la
            facturation, la comptabilité ou la banque : uniquement ce que toi-même y saisis.
          </li>
          <li>
            <strong>Ta boutique Shopify, si tu la connectes</strong> — l&apos;adresse de ta
            boutique et un jeton d&apos;accès, conservé chiffré, pour afficher tes produits et
            tes commandes dans Ignitux.
          </li>
          <li>
            <strong>La consommation de l&apos;IA</strong> — quel générateur, quand, et son
            coût, pour t&apos;en montrer le détail et respecter les limites de ton offre.
          </li>
          <li>
            <strong>Les journaux techniques et les rapports d&apos;erreur</strong> — quand une
            erreur se produit sur le serveur, un rapport part vers un salon privé (Discord)
            pour qu&apos;elle soit corrigée. Il contient seulement une référence, la méthode et
            l&apos;adresse de la page appelée (sans ses paramètres), le message et la trace
            technique de l&apos;erreur (dont les adresses email sont retirées
            automatiquement), l&apos;identifiant technique de ton compte — jamais ton email —
            et l&apos;heure. Le contenu de ce que tu envoies n&apos;en fait jamais partie.
          </li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Rien n&apos;est revendu, ni utilisé à des fins publicitaires. Aucune donnée n&apos;est
          utilisée pour entraîner un modèle d&apos;IA.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Qui reçoit ces données</h2>
        <p>
          À travers Ignitux, personne d&apos;autre que toi ne voit tes données, en dehors de
          ce que tu choisis toi-même de partager ou de publier (collaborateurs d&apos;un
          projet, commentaires, profil sur la marketplace) et de deux cas précis : un
          administrateur d&apos;Ignitux voit ta pièce d&apos;identité pour la valider, et le
          rapport d&apos;évaluation de financement pour le relire.
        </p>
        <p>Pour faire fonctionner le service, ces prestataires y ont un accès technique :</p>
        <ul>
          <li>
            <strong>Supabase</strong> — hébergement de la base de données, où tes données sont
            stockées. La base est située dans l&apos;Union européenne (Irlande).
          </li>
          <li>
            <strong>Render</strong> (États-Unis) — hébergement du serveur d&apos;Ignitux, par
            lequel passent les données échangées avec le site.
          </li>
          <li>
            <strong>Vercel</strong> (États-Unis) — hébergement du site ignitux.com ; reçoit
            les données techniques de navigation, comme ton adresse IP.
          </li>
          <li>
            <strong>Anthropic</strong> (États-Unis) — fournit l&apos;IA d&apos;IGINI. Au moment
            où tu utilises IGINI (générateurs, conversation, statuts, évaluation de
            financement), Anthropic reçoit ce qui est nécessaire pour produire la réponse : le
            contenu de ton projet, les éléments utiles de ton profil, ce que tu écris à IGINI
            et, pour des statuts, les noms des associés que tu indiques.
          </li>
          <li>
            <strong>Brevo</strong> (France) — envoi des emails du service (vérification de
            ton adresse, mot de passe oublié) depuis contact@ignitux.com ; reçoit ton adresse
            email et le contenu de ces emails.
          </li>
          <li>
            <strong>Cloudflare</strong> (États-Unis) — contrôle anti-robot (Turnstile) sur la
            page d&apos;inscription ; reçoit des données techniques de ton navigateur, dont ton
            adresse IP.
          </li>
          <li>
            <strong>Discord</strong> (États-Unis) — reçoit les rapports d&apos;erreur décrits
            plus haut.
          </li>
          <li>
            <strong>OVH</strong> (France) — nom de domaine ignitux.com, qui sert le site et
            l&apos;adresse contact@ignitux.com.
          </li>
          <li>
            <strong>Shopify</strong> — uniquement si tu connectes ta boutique : Ignitux y lit
            tes produits et tes commandes avec le jeton d&apos;accès que tu as autorisé.
          </li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Plusieurs de ces prestataires sont établis aux États-Unis (Render, Vercel, Anthropic,
          Cloudflare, Discord) : les données qu&apos;ils traitent pour Ignitux peuvent donc
          l&apos;être en dehors de l&apos;Union européenne.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Combien de temps</h2>
        <p>
          Tes données sont conservées tant que ton compte existe. Si tu le supprimes, tout
          part immédiatement et intégralement — sans période de grâce, sans copie de
          sauvegarde conservée par Ignitux. Deux exceptions, limitées à ce qui protège les
          tiers concernés : les mouvements financiers réellement engagés dans un projet
          financé par quelqu&apos;un d&apos;autre restent (ton identité, elle, en est
          détachée), et le suivi de consommation IA déjà facturé est conservé anonymisé.
        </p>
        <p style={{ marginBottom: 0 }}>
          En particulier : ta pièce d&apos;identité et sa vérification sont conservées tant
          que ton compte existe, y compris après validation, et supprimées avec lui ; un
          mandat révoqué reste enregistré comme révoqué jusqu&apos;à la suppression du
          compte ; les statuts, le dossier de création, la fiche d&apos;immatriculation,
          l&apos;évaluation de financement et la connexion à ta boutique Shopify sont
          supprimés avec le projet auquel ils se rattachent, ou avec ton compte. Si tu
          travailles en équipe, le journal d&apos;activité des membres (ce que ton comptable
          ou ton associé a fait dans ta facturation, ta comptabilité, ta banque ou ta
          caisse) est conservé 12 mois, puis supprimé automatiquement.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Tes droits</h2>
        <p>
          Accès, rectification, effacement, portabilité : tout se fait depuis{' '}
          <Link href="/account">Mon compte</Link>, sans avoir à nous écrire. Le bouton
          « Mes données » télécharge l&apos;intégralité de ce qu&apos;Ignitux sait de toi, y
          compris les images de ta pièce d&apos;identité si tu en as transmis une ;
          « Supprimer mon compte » l&apos;efface définitivement, après t&apos;avoir montré
          précisément ce qui va disparaître. Tu corriges tes informations directement dans
          l&apos;application.
        </p>
        <p style={{ marginBottom: 0 }}>
          Pour toute autre demande ou question sur tes données : contact@ignitux.com. Tu peux
          aussi adresser une réclamation à la CNIL (cnil.fr).
        </p>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Cookies et stockage local</h2>
        <p>
          Ignitux ne fait tourner aucun script de suivi et ne pose qu&apos;un seul cookie, et
          seulement si tu changes de langue depuis la page d&apos;accueil : il retient la
          langue choisie pendant un an. La connexion (ton jeton de session) est mémorisée
          uniquement dans le stockage local de ton navigateur, sur cet appareil.
        </p>
        <p style={{ marginBottom: 0 }}>
          Sur la page d&apos;inscription, le contrôle anti-robot de Cloudflare (Turnstile)
          s&apos;exécute dans ton navigateur ; ce qu&apos;il y enregistre relève de Cloudflare.
        </p>
      </div>
    </main>
  );
}
