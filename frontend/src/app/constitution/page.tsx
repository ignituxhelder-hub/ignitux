'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type ConstitutionArticle,
  type ConstitutionAuditEntry,
  type ConstitutionRule,
  type ConstitutionViolation,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Console d'audit constitutionnel — délibérément en lecture seule.
 *
 * Le brief demandait une « interface d'administration ». Un écran qui
 * permettrait de modifier les articles en base à chaud ferait du texte
 * fondateur une donnée mutable sans trace de qui l'a changé ni quand : la
 * Constitution vit donc dans le code, versionnée et relue comme lui, et cet
 * écran sert à voir ce que le moteur applique réellement — pas à négocier
 * avec lui.
 */
export default function ConstitutionPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [articles, setArticles] = useState<ConstitutionArticle[]>([]);
  const [preamble, setPreamble] = useState<string | null>(null);
  const [rules, setRules] = useState<ConstitutionRule[]>([]);
  const [audit, setAudit] = useState<ConstitutionAuditEntry[]>([]);
  const [violations, setViolations] = useState<ConstitutionViolation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    if (!token) return;

    setIsLoading(true);
    setError(null);
    Promise.all([
      api.getConstitutionPreamble(token),
      api.listConstitutionArticles(token),
      api.listConstitutionRules(token),
      api.getConstitutionAudit(token),
      api.listConstitutionViolations(token),
    ])
      .then(([preambleResult, articleList, ruleList, auditList, violationList]) => {
        setPreamble(preambleResult?.preamble ?? null);
        setArticles(articleList);
        setRules(ruleList);
        setAudit(auditList);
        setViolations(violationList);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : 'Impossible de charger la Constitution.',
        ),
      )
      .finally(() => setIsLoading(false));
  }, [isReady, token, router]);

  if (!isReady || !token) {
    return null;
  }

  const auditBySlug = new Map(audit.map((entry) => [entry.slug, entry]));
  const rulesBySlug = new Map<string, ConstitutionRule[]>();
  for (const rule of rules) {
    rulesBySlug.set(rule.articleSlug, [...(rulesBySlug.get(rule.articleSlug) ?? []), rule]);
  }

  const enforcedCount = articles.filter((article) => article.enforcement === 'enforced').length;

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Constitution IGNITUX</h1>
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Le texte fondateur d&apos;Ignitux et, en face de chaque article, ce que le système
          vérifie <strong>réellement</strong> dans le code.
        </p>
        {preamble && (
          <p style={{ marginBottom: '0.75rem', fontStyle: 'italic' }}>{preamble}</p>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          Texte officiel de la Constitution IGNITUX V1, 24 articles. La mention
          <strong> « Vérifié par le code »</strong> n&apos;est pas dans la Constitution :
          c&apos;est un constat technique sur ce que le moteur contrôle réellement, et le dire
          honnêtement est ce qu&apos;exige l&apos;article 11 (Transparence).
        </p>
      </div>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {!isLoading && articles.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Ce qui est appliqué, ce qui est déclaré</h2>
          <p className="muted">
            {enforcedCount} article(s) sur {articles.length} sont adossés à une règle exécutable ;
            les autres sont des énoncés de valeur qu&apos;aucun programme ne peut contrôler. Le
            moteur ne calcule volontairement aucun pourcentage global de « conformité
            constitutionnelle » : agréger des articles hétérogènes en un seul chiffre serait
            exactement le score inventé que l&apos;article 10 interdit.
          </p>
        </div>
      )}

      {articles.map((article) => {
        const entry = auditBySlug.get(article.slug);
        const articleRules = rulesBySlug.get(article.slug) ?? [];
        const isEnforced = article.enforcement === 'enforced';

        return (
          <div key={article.id} className="card" style={{ marginTop: '1.5rem' }}>
            <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>
                Article {article.number} — {article.title}
              </h2>
              <span
                className="muted"
                style={{ color: isEnforced ? 'var(--ok)' : 'var(--text-muted)' }}
              >
                {isEnforced ? 'Vérifié par le code' : 'Énoncé, non vérifiable'}
              </span>
            </div>
            <p style={{ marginTop: 0 }}>{article.text}</p>

            {articleRules.length > 0 && (
              <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
                {articleRules.map((rule) => (
                  <li key={rule.id} className="muted">
                    <code>{rule.id}</code> ({rule.severity === 'blocking' ? 'bloquant' : 'avertissement'}
                    ) — {rule.description}
                  </li>
                ))}
              </ul>
            )}

            <p className="muted" style={{ margin: 0 }}>
              {entry?.measured ?? 'Aucune donnée en base ne permet de mesurer cet article.'}
            </p>
            {entry && entry.violationsLast30Days > 0 && (
              <p className="error" style={{ marginBottom: 0 }}>
                {entry.violationsLast30Days} violation(s) relevée(s) sur les 30 derniers jours.
              </p>
            )}
          </div>
        );
      })}

      {!isLoading && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Journal des violations</h2>
          {violations.length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Aucune violation journalisée. Cela signifie qu&apos;aucune n&apos;a été relevée par
              les règles existantes — pas que le système est irréprochable sur les articles
              qu&apos;aucune règle ne couvre.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {violations.map((violation) => (
                <li
                  key={violation.id}
                  className="project-item"
                  style={{ cursor: 'default', marginBottom: '0.5rem' }}
                >
                  <span className="muted">
                    {new Date(violation.created_at).toLocaleString('fr-FR')} —{' '}
                    <code>{violation.rule_id}</code>
                  </span>
                  <p style={{ margin: '0.25rem 0 0' }}>{violation.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
