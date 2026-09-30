import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LegalFormRecommendation } from '@/lib/api';
import { FormeJuridiqueResultat } from './forme-juridique-resultat';

const BASE: LegalFormRecommendation = {
  id: 'r1',
  project_id: 'p1',
  recommended_form: 'SASU',
  rationale: "Le projet est porté seul, avec un chiffre d'affaires prévisionnel élevé.",
  points_to_check: [],
  assumptions: [],
  alternatives: [],
  sources: [],
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('FormeJuridiqueResultat', () => {
  it('affiche la forme recommandée et sa justification', () => {
    render(<FormeJuridiqueResultat recommandation={BASE} />);

    expect(screen.getByText(/Forme recommandée\s*:\s*SASU/)).toBeInTheDocument();
    expect(screen.getByText(BASE.rationale)).toBeInTheDocument();
  });

  it("affiche l'avertissement indicatif, mot pour mot comme dans les CGU", () => {
    render(<FormeJuridiqueResultat recommandation={BASE} />);

    expect(
      screen.getByText(
        /indicative, générée par IA, et ne remplace pas l'avis d'un professionnel \(comptable, avocat, expert-comptable\)/,
      ),
    ).toBeInTheDocument();
  });

  it("montre chaque hypothèse — sujet, supposition et façon de la corriger — quand IGINI a dû en faire", () => {
    // Coeur du principe de conception du composant : IGINI ne bloque jamais
    // faute d'information, il suppose et le dit. Une hypothèse cachée
    // deviendrait un fait tacite, exactement ce que ce générateur refuse.
    render(
      <FormeJuridiqueResultat
        recommandation={{
          ...BASE,
          assumptions: [
            {
              subject: 'Statut social',
              assumption: 'Tu es seul associé, sans conjoint impliqué dans le projet.',
              how_to_correct: 'Précise si vous êtes plusieurs associés.',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Statut social')).toBeInTheDocument();
    expect(
      screen.getByText(/Tu es seul associé, sans conjoint impliqué dans le projet\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Précise si vous êtes plusieurs associés\./)).toBeInTheDocument();
  });

  it("affiche le message d'absence de recherche en ligne quand aucune source n'a été consultée", () => {
    render(<FormeJuridiqueResultat recommandation={{ ...BASE, sources: [] }} />);

    expect(
      screen.getByText("Aucune recherche en ligne n'a été nécessaire pour cette recommandation."),
    ).toBeInTheDocument();
  });

  it('liste chaque source consultée comme un lien vers son url', () => {
    render(
      <FormeJuridiqueResultat
        recommandation={{
          ...BASE,
          sources: [
            { title: 'Service-public.fr — Choisir une forme juridique', url: 'https://www.service-public.fr/forme' },
            { title: 'impots.gouv.fr — Régime micro-entreprise', url: 'https://www.impots.gouv.fr/micro' },
          ],
        }}
      />,
    );

    const lien1 = screen.getByRole('link', { name: 'Service-public.fr — Choisir une forme juridique' });
    expect(lien1).toHaveAttribute('href', 'https://www.service-public.fr/forme');

    const lien2 = screen.getByRole('link', { name: 'impots.gouv.fr — Régime micro-entreprise' });
    expect(lien2).toHaveAttribute('href', 'https://www.impots.gouv.fr/micro');

    expect(
      screen.queryByText("Aucune recherche en ligne n'a été nécessaire pour cette recommandation."),
    ).not.toBeInTheDocument();
  });
});
