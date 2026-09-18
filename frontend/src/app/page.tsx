'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { IginiMention } from '@/components/igini-mention';
import { useAuth } from '@/lib/auth';

const STEPS = [
  {
    num: '01',
    name: 'Analyser',
    description: 'Résumé, score de faisabilité, points forts, risques, prochaines étapes.',
  },
  {
    num: '02',
    name: 'Construire',
    description: 'Plan de construction : jalons, délai estimé, ressources clés.',
  },
  {
    num: '03',
    name: 'Financer',
    description: 'Plan de financement : budget estimé, sources, postes de dépense.',
  },
  {
    num: '04',
    name: 'Développer',
    description: 'Plan de croissance : leviers, indicateurs clés, risques de passage à l\'échelle.',
  },
  {
    num: '05',
    name: 'Transmettre',
    description: 'Plan de transmission : options de transfert, documentation, check-list.',
  },
];

const ENGINES = [
  {
    name: 'Mémoire',
    description: "Ce qu'IGINI retient de tes décisions, préférences et apprentissages.",
  },
  {
    name: 'Connaissance',
    description: 'Un graphe de concepts pour relier les idées de ton projet entre elles.',
  },
  {
    name: 'Workflow',
    description: "Les suggestions d'IGINI deviennent des tâches suivables — jamais exécutées à ta place.",
  },
  {
    name: 'Score',
    description: "Un tableau de bord honnête de ton avancement, sans chiffre inventé.",
  },
];

export default function HomePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isReady && token) {
      router.replace('/projects');
    }
  }, [isReady, token, router]);

  return (
    <main className="page page--home">
      <div className="nav-bar">
        <p className="brand" style={{ margin: 0 }}>
          Ignitux
        </p>
        <div className="nav-links">
          <Link href="/login" className="muted">
            Se connecter
          </Link>
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              Créer un compte
            </button>
          </Link>
        </div>
      </div>

      <div className="hero">
        <h1>Transformer une idée en réalité</h1>
        <IginiMention>
          t&apos;accompagne pour analyser, construire, financer, développer et transmettre ton
          projet — depuis un seul endroit. La vérité avant tout.
        </IginiMention>
        <div className="hero-actions">
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              Commencer gratuitement
            </button>
          </Link>
          <Link href="/login" className="muted" style={{ alignSelf: 'center' }}>
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>

      <section className="section">
        <p className="section-title">La méthode en 5 étapes</p>
        <div className="steps-grid">
          {STEPS.map((step) => (
            <div className="card step-card" key={step.num}>
              <div className="step-num">{step.num}</div>
              <h3>{step.name}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="section-title">Ce qu&apos;IGINI garde en tête</p>
        <div className="card engine-list">
          {ENGINES.map((engine) => (
            <div key={engine.name}>
              <h3>{engine.name}</h3>
              <p>{engine.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="section-title">Communauté</p>
        <div className="card">
          <p style={{ margin: 0 }}>
            Rends un projet public quand tu es prêt, et reçois des encouragements d&apos;autres
            porteurs de projet — rien de plus pour l&apos;instant, pas de messagerie privée ni de
            classement.
          </p>
        </div>
      </section>

      <section className="section" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ marginTop: 0 }}>Prêt à donner vie à ton idée ?</p>
          <Link href="/signup">
            <button className="primary" type="button" style={{ width: 'auto' }}>
              Créer un compte
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
