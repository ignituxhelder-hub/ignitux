import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConfidentialitePage from './page';
import MentionsLegalesPage from '../mentions-legales/page';

/**
 * La politique de confidentialité doit nommer les prestataires réellement
 * utilisés et la bonne adresse de contact. Ce test empêche un retour en
 * arrière silencieux (l'ancienne adresse, ou un prestataire qui disparaît du
 * texte alors qu'il reçoit toujours des données).
 */
describe('politique de confidentialité', () => {
  it('nomme les prestataires qui reçoivent des données', () => {
    const { container } = render(<ConfidentialitePage />);
    const texte = container.textContent ?? '';

    for (const prestataire of ['Brevo', 'Discord', 'Cloudflare', 'Anthropic', 'Supabase', 'Render', 'Vercel']) {
      expect(texte).toContain(prestataire);
    }
  });

  it("donne l'adresse de contact actuelle et la date de mise à jour", () => {
    const { container } = render(<ConfidentialitePage />);
    const texte = container.textContent ?? '';

    expect(texte).toContain('contact@ignitux.com');
    expect(texte).not.toContain('outlook');
    expect(texte).toContain('Dernière mise à jour : 14 octobre 2026');
  });

  it("annonce la conservation de 12 mois du journal d'activité des membres d'une équipe", () => {
    const { container } = render(<ConfidentialitePage />);
    expect(container.textContent ?? '').toMatch(/journal d.activité des membres[^.]*conservé 12 mois/);
  });
});

describe('mentions légales', () => {
  it("donne l'adresse de contact actuelle et les trois hébergeurs", () => {
    const { container } = render(<MentionsLegalesPage />);
    const texte = container.textContent ?? '';

    expect(texte).toContain('contact@ignitux.com');
    expect(texte).not.toContain('outlook');
    for (const hebergeur of ['Vercel', 'Render', 'Supabase']) {
      expect(texte).toContain(hebergeur);
    }
  });
});
