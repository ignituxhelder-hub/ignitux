import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEMOIGNAGES } from '@/lib/temoignages';
import { Temoignages } from './temoignages';

describe('Temoignages', () => {
  it('ne rend rien tant que la liste est vide — pas même un titre', () => {
    const { container } = render(<Temoignages temoignages={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('montre les mots de la personne, son nom et son activité, quand il y en a', () => {
    render(
      <Temoignages
        temoignages={[
          { nom: 'Camille R.', activite: 'Boulangerie à Lyon', texte: 'Mots de la personne.', accordLe: '2026-11-02' },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Témoignages' })).toBeInTheDocument();
    expect(screen.getByText('Mots de la personne.').tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText('Camille R. — Boulangerie à Lyon')).toBeInTheDocument();
  });

  it('chaque témoignage publié a des mots et un accord écrit daté, jamais dans le futur', () => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    for (const temoignage of TEMOIGNAGES) {
      expect(temoignage.nom.trim()).not.toBe('');
      expect(temoignage.texte.trim()).not.toBe('');
      expect(temoignage.accordLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(temoignage.accordLe))).toBe(false);
      expect(temoignage.accordLe <= aujourdhui).toBe(true);
    }
  });
});
