import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Error from './error';
import NotFound from './not-found';

describe('écrans de secours', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('page introuvable', () => {
    it('parle français et ne ressemble pas à une panne', () => {
      // Sans ce fichier, Next servait « 404: This page could not be
      // found. » — en anglais, sans style. Pour quelqu'un qui teste, ça
      // se lit comme une panne alors que l'adresse est simplement fausse.
      const { container } = render(<NotFound />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("n'existe pas");
      expect(container.textContent).toContain("Ce n'est pas une panne");
    });

    it('donne une sortie', () => {
      render(<NotFound />);

      expect(screen.getByRole('button', { name: /retour à mes projets/i })).toBeInTheDocument();
    });
  });

  describe('page en erreur', () => {
    function renderError(reset = vi.fn(), error = new globalThis.Error('boum')) {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      return { reset, ...render(<Error error={error} reset={reset} />) };
    }

    it("dit que l'échec vient du produit, pas de la personne", () => {
      const { container } = renderError();

      expect(container.textContent).toContain('de notre côté, pas du tien');
    });

    it('ne promet rien sur les données', () => {
      // On ne sait pas si l'action a abouti côté serveur. Écrire « rien
      // n'a été perdu » serait inventer une garantie qu'on n'a pas.
      const { container } = renderError();

      expect(container.textContent).toContain('vérifie-le');
      expect(container.textContent).not.toMatch(/rien n'a été perdu|tes données sont intactes/);
    });

    it('propose de réessayer sans recharger toute l\'application', () => {
      const { reset } = renderError();

      fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));

      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("journalise le détail technique sans l'afficher", () => {
      // Le détail n'aiderait personne à l'écran et pourrait exposer des
      // informations internes.
      const erreur = new globalThis.Error('chaine-interne-a-ne-pas-montrer');
      const { container } = renderError(vi.fn(), erreur);

      expect(container.textContent).not.toContain('chaine-interne-a-ne-pas-montrer');
      expect(console.error).toHaveBeenCalled();
    });

    it("affiche la référence quand le serveur en fournit une", () => {
      const erreur = Object.assign(new globalThis.Error('boum'), { digest: 'abc123' });
      const { container } = renderError(vi.fn(), erreur);

      expect(container.textContent).toContain('abc123');
    });

    it("n'invente pas de référence quand il n'y en a pas", () => {
      const { container } = renderError();

      expect(container.textContent).not.toContain('Référence à donner');
    });
  });
});
