'use client';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApercuAnalyse } from '@/components/apercu-analyse';
import { Icone } from '@/components/icones';
import { Brand } from '@/components/ignitux-mark';
import { SelecteurLangue } from '@/components/selecteur-langue';
import { Temoignages } from '@/components/temoignages';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BAREME_PUBLIC, prixEnEuros, type ExemplePublic } from '@/lib/bareme-public';
import { OUTILS_RECOMMANDES } from '@/lib/outils-recommandes';

/*
 * L'accueil, depuis le 2026-10-31 : « De l'idée à l'entreprise ». IGINI est
 * le guide — analyser, créer, construire, avancer — et les outils de gestion
 * d'Ignitux sont la version simple pour démarrer, à côté des outils
 * spécialisés du marché (lib/outils-recommandes.ts). Chaque phrase décrit ce
 * que le produit fait aujourd'hui (messages `accueil.*`) : rien n'y est
 * promis que le code ne fasse pas.
 */
const PARCOURS = [
  { key: 'analyser', glyphe: 'analyse' },
  { key: 'creer', glyphe: 'forme-juridique' },
  { key: 'construire', glyphe: 'construction' },
  { key: 'avancer', glyphe: 'developpement' },
] as const;
const CONCRET = ['analyse', 'creation', 'plan', 'memoire'] as const;
const POUR_QUI = ['idee', 'creation', 'entreprise'] as const;
// Depuis le 2026-10-25 : plus d'abonnement. Les outils sont gratuits, les
// actions d'IGINI se paient en crédits (voir lib/bareme-public.ts).
const LIGNES_OUTILS = ['projets', 'creation', 'gestion', 'equipe'] as const;
const LIGNES_IGINI = ['bienvenue', 'affiche'] as const;
const EXEMPLES: readonly ExemplePublic[] = ['analyser', 'construire', 'statuts', 'discuter'];
const TRANSPARENCE = ['decisions', 'europe', 'vente', 'export', 'ia'] as const;
const FAQ = ['gratuit', 'outils', 'creation', 'statuts', 'telephone'] as const;

export default function HomePage() {
  const t = useTranslations('accueil');
  const locale = useLocale();
  const { token, isReady } = useAuth();
  const router = useRouter();
  // `null` tant que le serveur n'a rien dit, et sous 50 projets : le
  // compteur n'apparaît alors pas (backend/src/vitrine).
  const [projets, setProjets] = useState<number | null>(null);

  // Les prix viennent du miroir du barème du serveur, jamais d'un texte
  // traduit : un prix changé d'un côté seulement fait échouer les tests.
  const valeurCredit = prixEnEuros(BAREME_PUBLIC.valeurCreditCentimes, locale);
  const enCredits = (n: number) => t(n > 1 ? 'prix.credit.plusieurs' : 'prix.credit.un', { n });
  const [r1, r2, r3] = BAREME_PUBLIC.recharges.map((r) => prixEnEuros(r.prixCentimes, locale));
  const bienvenue = { n: BAREME_PUBLIC.bienvenue };
  const chiffresFaq = { n: BAREME_PUBLIC.bienvenue, valeur: valeurCredit };

  useEffect(() => {
    if (isReady && token) {
      router.replace('/accueil');
    }
  }, [isReady, token, router]);

  useEffect(() => {
    let actif = true;
    api
      .getCompteurProjets()
      .then((reponse) => {
        // Seul un vrai nombre s'affiche : une réponse inattendue ne doit
        // jamais écrire « Déjà undefined projets ».
        if (actif) setProjets(typeof reponse?.projets === 'number' ? reponse.projets : null);
      })
      // Sans réseau ou sans serveur, l'accueil se passe du chiffre.
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, []);

  const inscription = (
    <Link href="/signup">
      <button className="primary" type="button" style={{ width: 'auto' }}>
        {t('creerCompteGratuit')}
      </button>
    </Link>
  );

  return (
    <main className="page page--home">
      <div className="nav-bar">
        <Brand />
        <div className="nav-links">
          <SelecteurLangue />
          <Link href="/login" className="muted">
            {t('seConnecter')}
          </Link>
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              {t('creerCompte')}
            </button>
          </Link>
        </div>
      </div>

      {/* La grande scène (direction « Gravure ») : la boussole au centre, les
          mots de la méthode et la devise autour, le nom gravé, puis la
          promesse — le vrai titre de la page. Tout le texte est du vrai
          texte : traduit, lisible sur téléphone, présent si l'image ne charge
          pas. */}
      <div className="scene">
        <p className="scene__cote scene__cote--gauche">
          {/* Les espaces entre les mots comptent : sans elles, un lecteur
              d'écran lit « DécouvrirConstruireTransmettre ». */}
          <span>{t('scene.decouvrir')}</span>{' '}
          <span>{t('scene.construire')}</span>{' '}
          <span>{t('scene.transmettre')}</span>
        </p>
        <Image
          className="scene__boussole"
          src="/images/accueil/boussole.jpg"
          width={810}
          height={440}
          alt=""
          priority
        />
        <p className="scene__cote scene__cote--droite">
          <span>{t('scene.nousServir')}</span>{' '}
          <span className="scene__trait" aria-hidden="true" />
          <span>{t('scene.verite')}</span>
        </p>
        <p className="scene__nom">Ignitux</p>
        <span className="scene__ligne" aria-hidden="true" />
        <h1 className="scene__promesse">{t('scene.promesse')}</h1>
        <p className="scene__sous-titre">
          <strong className="igini-nom">IGINI</strong> {t('scene.sousTitre')}
        </p>
        <div className="hero-actions">
          {inscription}
          <Link href="/login" className="muted">
            {t('dejaCompte')}
          </Link>
        </div>
        <ul className="reassurance" aria-label={t('reassurance.titre')}>
          <li>{t('reassurance.abonnement')}</li>
          <li>{t('reassurance.bienvenue', bienvenue)}</li>
          <li>{t('reassurance.decisions')}</li>
          {projets !== null && <li>{t('reassurance.projets', { n: projets })}</li>}
        </ul>
      </div>

      <section className="section" aria-labelledby="accueil-parcours">
        <h2 className="section-title" id="accueil-parcours">
          {t('parcours.titre')}
        </h2>
        <ol className="chemin">
          {PARCOURS.map((etape) => (
            <li key={etape.key} className="chemin__etape">
              <span className="chemin__icone">
                <Icone id={etape.glyphe} />
              </span>
              <h3>{t(`parcours.etapes.${etape.key}.nom`)}</h3>
              <p>{t(`parcours.etapes.${etape.key}.texte`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="accueil-concret">
        <h2 className="section-title" id="accueil-concret">
          {t('concret.titre')}
        </h2>
        <div className="concret">
          <ul className="accueil-grille concret__cartes">
            {CONCRET.map((cle) => (
              <li key={cle} className="card">
                <h3>{t(`concret.${cle}.nom`)}</h3>
                <p>{t(`concret.${cle}.texte`)}</p>
              </li>
            ))}
          </ul>
          <ApercuAnalyse />
        </div>
      </section>

      <section className="section" aria-labelledby="accueil-pour-qui">
        <h2 className="section-title" id="accueil-pour-qui">
          {t('pourQui.titre')}
        </h2>
        <ul className="accueil-grille">
          {POUR_QUI.map((cle) => (
            <li key={cle} className="card">
              <h3>{t(`pourQui.${cle}.nom`)}</h3>
              <p>{t(`pourQui.${cle}.texte`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Les outils de gestion d'Ignitux existent et restent gratuits : ils
          sont présentés pour ce qu'ils sont, la version simple pour démarrer.
          À côté, les outils spécialisés — des recommandations, jamais des
          « partenaires » : aucun accord commercial, et la page le dit. */}
      <section className="section" aria-labelledby="accueil-outils">
        <h2 className="section-title" id="accueil-outils">
          {t('outils.titre')}
        </h2>
        <div className="card outils-inclus">
          <p className="outils-inclus__etiquette">{t('outils.inclus.etiquette')}</p>
          <h3>{t('outils.inclus.nom')}</h3>
          <p>{t('outils.inclus.texte')}</p>
          <p className="accueil-note">{t('outils.inclus.limite')}</p>
        </div>
        <h3 className="outils-specialises__titre">{t('outils.specialises.titre')}</h3>
        <p className="section-intro">{t('outils.specialises.intro')}</p>
        <ul className="accueil-grille">
          {OUTILS_RECOMMANDES.map((outil) => (
            <li key={outil.id} className="card outil">
              <p className="outil__domaine">{t(`outils.domaines.${outil.domaine}`)}</p>
              <h4>{outil.nom}</h4>
              <p>{t(`outils.liste.${outil.id}`)}</p>
              <a className="outil__lien" href={outil.url} target="_blank" rel="noopener noreferrer">
                {new URL(outil.url).hostname.replace(/^www\./, '')}
                <span className="visuellement-cache"> {t('outils.nouvelOnglet')}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="accueil-note">{t('outils.independance')}</p>
      </section>

      <section className="section" aria-labelledby="accueil-prix">
        <h2 className="section-title" id="accueil-prix">
          {t('prix.titre')}
        </h2>
        <p className="section-intro">{t('prix.intro')}</p>
        <ul className="accueil-grille accueil-grille--deux">
          <li className="card">
            <h3>{t('prix.outils.nom')}</h3>
            <p className="accueil-prix">{t('prix.gratuit')}</p>
            <ul className="accueil-liste">
              {LIGNES_OUTILS.map((ligne) => (
                <li key={ligne}>{t(`prix.outils.${ligne}`)}</li>
              ))}
            </ul>
          </li>
          <li className="card">
            <h3>{t('prix.igini.nom')}</h3>
            <p className="accueil-prix">{t('prix.igini.valeur', { valeur: valeurCredit })}</p>
            <ul className="accueil-liste">
              {LIGNES_IGINI.map((ligne) => (
                <li key={ligne}>{t(`prix.igini.${ligne}`, bienvenue)}</li>
              ))}
            </ul>
            <p style={{ marginTop: '0.75rem' }}>{t('prix.igini.exemples')}</p>
            <ul className="accueil-liste">
              {EXEMPLES.map((cle) => (
                <li key={cle}>
                  {t(`prix.exemples.${cle}`, { credits: enCredits(BAREME_PUBLIC.exemples[cle]) })}
                </li>
              ))}
            </ul>
          </li>
        </ul>
        {/* Rien n'encaisse encore (paiement par carte : lot 2, voir
            backend/src/credits/bareme.ts) : la page le dit plutôt que de
            laisser croire qu'on peut payer. */}
        <p className="accueil-note">{t('prix.paiement', { a: r1, b: r2, c: r3 })}</p>
      </section>

      {/* Rien tant qu'aucune vraie personne n'a donné son accord écrit. */}
      <Temoignages />

      <section className="section" aria-labelledby="accueil-transparence">
        <h2 className="section-title" id="accueil-transparence">
          {t('transparence.titre')}
        </h2>
        <div className="card">
          <ul className="accueil-liste">
            {TRANSPARENCE.map((cle) => (
              <li key={cle}>{t(`transparence.${cle}`)}</li>
            ))}
          </ul>
          <p className="accueil-lien">
            <Link href="/confidentialite">{t('transparence.lien')}</Link>
          </p>
        </div>
      </section>

      {/* Repliées : la question se lit d'un coup d'œil, la réponse s'ouvre à
          la demande. Le bouton qui suit clôt la page. */}
      <section className="section" aria-labelledby="accueil-faq">
        <h2 className="section-title" id="accueil-faq">
          {t('faq.titre')}
        </h2>
        <div className="card faq">
          {FAQ.map((cle) => (
            <details key={cle}>
              <summary>{t(`faq.${cle}.q`)}</summary>
              <p>{t(`faq.${cle}.r`, chiffresFaq)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section accueil-final" aria-labelledby="accueil-final">
        <div className="card">
          <h2 id="accueil-final" className="accueil-final__titre">
            {t('pret')}
          </h2>
          {inscription}
          <p className="accueil-final__note">{t('finalNote', bienvenue)}</p>
        </div>
      </section>
    </main>
  );
}
