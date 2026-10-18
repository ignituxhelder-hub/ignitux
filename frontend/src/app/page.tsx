'use client';

import { useTranslations } from 'next-intl';
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

export default function HomePage() {
  const t = useTranslations('accueil');
  const { token, isReady } = useAuth();
  const router = useRouter();

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
