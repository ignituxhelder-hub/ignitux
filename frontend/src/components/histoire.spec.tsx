import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Histoire } from './histoire';

describe('Histoire', () => {
  it("raconte les six étapes dans l'ordre, en vrai texte", () => {
    render(<Histoire />);

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      "L'étincelle",
      'Le doute',
      'La rencontre',
      'La construction',
      'La réussite',
      'Un avenir plus grand',
    ]);
    // Le site tutoie, et le texte est corrigé (l'image de référence disait
    // « obstcale »).
    expect(screen.getByText("Et si tu n'étais plus seul ?")).toBeInTheDocument();
    expect(
      screen.getByText('Mais entre une idée et la réalité, il y a souvent un obstacle.'),
    ).toBeInTheDocument();
    // Les vignettes sont des décors : le sens est dans le texte.
    const images = document.querySelectorAll('img.frise__image');
    expect(images).toHaveLength(6);
    for (const image of images) expect(image).toHaveAttribute('alt', '');
  });
});
