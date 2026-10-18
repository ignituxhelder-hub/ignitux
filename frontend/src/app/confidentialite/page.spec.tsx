import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { signInAs } from '@/test-utils/mocks';
import ConfidentialitePage from './page';
import CguPage from '../cgu/page';
import MentionsLegalesPage from '../mentions-legales/page';

/** Les pages légales lisent la session pour leur lien de retour. */
function afficher(page: ReactElement) {
  return render(<AuthProvider>{page}</AuthProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

/**
 * La politique de confidentialité doit nommer les prestataires réellement
 * utilisés et la bonne adresse de contact. Ce test empêche un retour en
 * arrière silencieux (l'ancienne adresse, ou un prestataire qui disparaît du
 * texte alors qu'il reçoit toujours des données).
 */
describe('politique de confidentialité', () => {
  it('nomme les prestataires qui reçoivent des données', () => {
    const { container } = afficher(<ConfidentialitePage />);
    const texte = container.textContent ?? '';

    for (const prestataire of ['Brevo', 'Discord', 'Cloudflare', 'Anthropic', 'Supabase', 'Render', 'Vercel']) {
      expect(texte).toContain(prestataire);
    }
  });

  it("donne l'adresse de contact actuelle et la date de mise à jour", () => {
    const { container } = afficher(<ConfidentialitePage />);
    const texte = container.textContent ?? '';

    expect(texte).toContain('contact@ignitux.com');
    expect(texte).not.toContain('outlook');
    expect(texte).toContain('Dernière mise à jour : 14 octobre 2026');
  });

  it("annonce la conservation de 12 mois du journal d'activité des membres d'une équipe", () => {
    const { container } = afficher(<ConfidentialitePage />);
    expect(container.textContent ?? '').toMatch(/journal d.activité des membres[^.]*conservé 12 mois/);
  });
});

describe('mentions légales', () => {
  it("donne l'adresse de contact actuelle et les trois hébergeurs", () => {
    const { container } = afficher(<MentionsLegalesPage />);
    const texte = container.textContent ?? '';

    expect(texte).toContain('contact@ignitux.com');
    expect(texte).not.toContain('outlook');
    for (const hebergeur of ['Vercel', 'Render', 'Supabase']) {
      expect(texte).toContain(hebergeur);
    }
  });
});

/**
 * Ces pages s'ouvrent aussi depuis l'accueil et l'inscription, sans compte.
 * « Retour à Mon compte » y menait à une page qui demande de se connecter.
 */
describe('le lien de retour des pages légales', () => {
  const PAGES = [
    ['confidentialité', ConfidentialitePage],
    ['CGU', CguPage],
    ['mentions légales', MentionsLegalesPage],
  ] as const;

  it.each(PAGES)('%s : un visiteur revient à l’accueil', (_nom, Page) => {
    afficher(<Page />);

    expect(screen.getByRole('link', { name: "← Retour à l'accueil" })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: '← Retour à Mon compte' })).not.toBeInTheDocument();
  });

  it.each(PAGES)('%s : une personne connectée revient à Mon compte', async (_nom, Page) => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
    afficher(<Page />);

    expect(await screen.findByRole('link', { name: '← Retour à Mon compte' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.queryByRole('link', { name: "← Retour à l'accueil" })).not.toBeInTheDocument();
  });
});
