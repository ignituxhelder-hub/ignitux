'use client';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Histoire } from '@/components/histoire';
import { IconesExplicatives } from '@/components/icones-explicatives';
import { IginiMention } from '@/components/igini-mention';
import { Brand } from '@/components/ignitux-mark';
import { SelecteurLangue } from '@/components/selecteur-langue';
import { useAuth } from '@/lib/auth';
import { BAREME_PUBLIC, prixEnEuros, type ExemplePublic } from '@/lib/bareme-public';

const STEPS = [
  { key: 'analyser', glyphe: 'analyse', categorie: 'creer' },
  { key: 'construire', glyphe: 'construction', categorie: 'vendre' },
  { key: 'financer', glyphe: 'financement', categorie: 'investir' },
  { key: 'developper', glyphe: 'developpement', categorie: 'gerer' },
  { key: 'transmettre', glyphe: 'transmission', categorie: 'reseau' },
] as const;

const ENGINES = [
  { key: 'memoire', glyphe: 'memoire' },
  { key: 'connaissance', glyphe: 'connaissances' },
  { key: 'workflow', glyphe: 'automatisation' },
  { key: 'score', glyphe: 'score' },
] as const;

/*
 * Sous la méthode, ce qu'un visiteur cherche avant de s'inscrire : ce
 * qu'Ignitux fait, pour qui, combien, ce que deviennent ses données, et les
 * questions qu'il se pose. Chaque phrase décrit ce que le produit fait
 * aujourd'hui (voir les messages `accueil.concretement` à `accueil.faq`) :
 * rien n'y est promis que le code ne fasse pas.
 */
const CONCRETEMENT = ['analyse', 'forme', 'dossier', 'gestion', 'equipe', 'financement'] as const;
const POUR_QUI = ['idee', 'creation', 'entreprise'] as const;
// Depuis le 2026-10-25 : plus d'abonnement. Les outils sont gratuits, les
// actions d'IGINI se paient en crédits (voir lib/bareme-public.ts).
const LIGNES_OUTILS = ['projets', 'gestion', 'equipe'] as const;
const LIGNES_IGINI = ['bienvenue', 'affiche'] as const;
const EXEMPLES: readonly ExemplePublic[] = ['analyser', 'construire', 'statuts', 'discuter'];
const DONNEES = ['europe', 'vente', 'export', 'ia'] as const;
const FAQ = ['gratuit', 'creation', 'statuts', 'ia', 'equipe', 'telephone', 'pays'] as const;

export default function HomePage() {
  const t = useTranslations('accueil');
  const locale = useLocale();
  const { token, isReady } = useAuth();
  const router = useRouter();

  // Les prix viennent du miroir du barème du serveur, jamais d'un texte
  // traduit : un prix changé d'un côté seulement fait échouer les tests.
  const valeurCredit = prixEnEuros(BAREME_PUBLIC.valeurCreditCentimes, locale);
  const enCredits = (n: number) => t(n > 1 ? 'prix.credit.plusieurs' : 'prix.credit.un', { n });
  const [r1, r2, r3] = BAREME_PUBLIC.recharges.map((r) => prixEnEuros(r.prixCentimes, locale));
  const chiffresFaq = { n: BAREME_PUBLIC.bienvenue, valeur: valeurCredit };

  useEffect(() => {
    if (isReady && token) {
      router.replace('/accueil');
    }
  }, [isReady, token, router]);

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

      {/* La grande scène (direction « Gravure ») : la boussole au centre,
          la méthode à sa gauche, la mission et la devise à sa droite, puis le
          nom gravé. Tout le texte est du vrai texte — traduit, lisible sur
          téléphone, présent même si l'image ne charge pas. */}
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
        <h1 className="scene__nom">Ignitux</h1>
        <span className="scene__ligne" aria-hidden="true" />
        <p className="scene__devise">{t('scene.devise')}</p>
        <IginiMention>{t('iginiMention')}</IginiMention>
        <div className="hero-actions">
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              {t('commencer')}
            </button>
          </Link>
          <Link href="/login" className="muted" style={{ alignSelf: 'center' }}>
            {t('dejaCompte')}
          </Link>
        </div>
      </div>

      <Histoire />

      <section className="section">
        <p className="section-title">{t('methode')}</p>
        <IconesExplicatives
          titre={t('methode')}
          icones={STEPS.map((step) => ({
            id: step.key,
            nom: t(`etapes.${step.key}.nom`),
            glyphe: step.glyphe,
            categorie: step.categorie,
            texte: t(`etapes.${step.key}.description`),
          }))}
        />
      </section>

      <section className="section">
        <p className="section-title">{t('gardeEnTete')}</p>
        <IconesExplicatives
          titre={t('gardeEnTete')}
          icones={[
            ...ENGINES.map((engine) => ({
              id: engine.key,
              nom: t(`moteurs.${engine.key}.nom`),
              glyphe: engine.glyphe,
              categorie: 'reglages',
              texte: t(`moteurs.${engine.key}.description`),
            })),
            {
              id: 'communaute',
              nom: t('communaute'),
              glyphe: 'communaute',
              categorie: 'reseau',
              texte: t('communauteTexte'),
            },
          ]}
        />
      </section>

      <section className="section" aria-labelledby="accueil-concretement">
        <p className="section-title" id="accueil-concretement">
          {t('concretement.titre')}
        </p>
        <ul className="accueil-grille">
          {CONCRETEMENT.map((cle) => (
            <li key={cle} className="card">
              <h3>{t(`concretement.${cle}.nom`)}</h3>
              <p>{t(`concretement.${cle}.texte`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="accueil-pour-qui">
        <p className="section-title" id="accueil-pour-qui">
          {t('pourQui.titre')}
        </p>
        <ul className="accueil-grille">
          {POUR_QUI.map((cle) => (
            <li key={cle} className="card">
              <h3>{t(`pourQui.${cle}.nom`)}</h3>
              <p>{t(`pourQui.${cle}.texte`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="accueil-prix">
        <p className="section-title" id="accueil-prix">
          {t('prix.titre')}
        </p>
        <ul className="accueil-grille">
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
                <li key={ligne}>{t(`prix.igini.${ligne}`, { n: BAREME_PUBLIC.bienvenue })}</li>
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

      <section className="section" aria-labelledby="accueil-donnees">
        <p className="section-title" id="accueil-donnees">
          {t('donnees.titre')}
        </p>
        <div className="card">
          <ul className="accueil-liste">
            {DONNEES.map((cle) => (
              <li key={cle}>{t(`donnees.${cle}`)}</li>
            ))}
          </ul>
          <p className="accueil-lien">
            <Link href="/confidentialite">{t('donnees.lien')}</Link>
          </p>
        </div>
      </section>

      {/* Repliées : la question se lit d'un coup d'œil, la réponse s'ouvre à
          la demande. Le bouton « Créer un compte » qui suit clôt la page. */}
      <section className="section" aria-labelledby="accueil-faq">
        <p className="section-title" id="accueil-faq">
          {t('faq.titre')}
        </p>
        <div className="card faq">
          {FAQ.map((cle) => (
            <details key={cle}>
              <summary>{t(`faq.${cle}.q`)}</summary>
              <p>{t(`faq.${cle}.r`, chiffresFaq)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ marginTop: 0 }}>{t('pret')}</p>
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              {t('creerCompte')}
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
