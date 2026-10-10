'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { IginiMention } from '@/components/igini-mention';
import { Brand, IgnituxMark } from '@/components/ignitux-mark';
import { SelecteurLangue } from '@/components/selecteur-langue';
import { useAuth } from '@/lib/auth';

const STEPS = [
  { num: '01', key: 'analyser' },
  { num: '02', key: 'construire' },
  { num: '03', key: 'financer' },
  { num: '04', key: 'developper' },
  { num: '05', key: 'transmettre' },
] as const;

const ENGINES = ['memoire', 'connaissance', 'workflow', 'score'] as const;

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

      <div className="hero">
        {/* La boussole en filigrane : elle donne sa forme à la page sans
            rien affirmer. Masquée sur mobile, où elle n'aurait plus de
            place pour respirer. */}
        <IgnituxMark size={320} className="hero-rose" />
        <p className="hero-eyebrow">{t('eyebrow')}</p>
        <h1>{t('titre')}</h1>
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

      <section className="section">
        <p className="section-title">{t('methode')}</p>
        <div className="steps-grid">
          {STEPS.map((step) => (
            <div className="card step-card" key={step.num}>
              <div className="step-num">{step.num}</div>
              <h3>{t(`etapes.${step.key}.nom`)}</h3>
              <p>{t(`etapes.${step.key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="section-title">{t('gardeEnTete')}</p>
        <div className="card engine-list">
          {ENGINES.map((engine) => (
            <div key={engine}>
              <h3>{t(`moteurs.${engine}.nom`)}</h3>
              <p>{t(`moteurs.${engine}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="section-title">{t('communaute')}</p>
        <div className="card">
          <p style={{ margin: 0 }}>{t('communauteTexte')}</p>
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
