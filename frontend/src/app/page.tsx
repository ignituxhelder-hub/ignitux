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
import { OFFRES_PUBLIQUES, prixEnEuros } from '@/lib/offres-publiques';

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
const LIGNES_DECOUVERTE = ['projets', 'analyses'] as const;
const LIGNES_ENTREPRENEUR = ['projets', 'generations', 'gestion', 'financement', 'equipe'] as const;
const DONNEES = ['europe', 'vente', 'export', 'ia'] as const;
const FAQ = ['gratuit', 'creation', 'statuts', 'ia', 'equipe', 'telephone', 'pays'] as const;

export default function HomePage() {
  const t = useTranslations('accueil');
  const locale = useLocale();
  const { token, isReady } = useAuth();
  const router = useRouter();

  // Les prix viennent du miroir du catalogue du serveur, jamais d'un texte
  // traduit : un tarif changé d'un côté seulement fait échouer les tests.
  const { decouverte, entrepreneur } = OFFRES_PUBLIQUES;
  const prix = (centimes: number) =>
    centimes === 0 ? t('prix.gratuit') : t('prix.parMois', { prix: prixEnEuros(centimes, locale) });
  const chiffresFaq = {
    n: decouverte.appelsIaParMois,
    prix: prixEnEuros(entrepreneur.prixCentimes, locale),
  };

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
            <h3>{t('prix.decouverte.nom')}</h3>
            <p className="accueil-prix">{prix(decouverte.prixCentimes)}</p>
            <ul className="accueil-liste">
              {LIGNES_DECOUVERTE.map((ligne) => (
                <li key={ligne}>{t(`prix.decouverte.${ligne}`, { n: decouverte.appelsIaParMois })}</li>
              ))}
            </ul>
          </li>
          <li className="card">
            <h3>{t('prix.entrepreneur.nom')}</h3>
            <p className="accueil-prix">{prix(entrepreneur.prixCentimes)}</p>
            <ul className="accueil-liste">
              {LIGNES_ENTREPRENEUR.map((ligne) => (
                <li key={ligne}>
                  {t(`prix.entrepreneur.${ligne}`, { n: entrepreneur.appelsIaParMois })}
                </li>
              ))}
            </ul>
          </li>
        </ul>
        {/* Rien n'encaisse encore (voir backend/src/offres/offres.service.ts) :
            la page le dit plutôt que de laisser croire qu'on peut payer. */}
        <p className="accueil-note">{t('prix.paiement')}</p>
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
