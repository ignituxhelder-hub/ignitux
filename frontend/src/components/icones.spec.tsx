import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APPS_SYSTEME } from '@/lib/systeme';
import { ETAPES_PROJET, OUTILS_PROJET } from '@/lib/etapes-projet';
import { Icone } from './icones';

describe('Icone', () => {
  it.each(APPS_SYSTEME.map((app) => app.id))(
    'a une icône dessinée pour l’application « %s »',
    (id) => {
      const { container } = render(<Icone id={id} />);
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );

  it.each(ETAPES_PROJET.map((etape) => etape.id))(
    'a une icône dessinée pour l’étape de projet « %s »',
    (id) => {
      const { container } = render(<Icone id={id} />);
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );

  it.each(OUTILS_PROJET.map((outil) => outil.id))(
    'a une icône dessinée pour l’outil de projet « %s »',
    (id) => {
      const { container } = render(<Icone id={id} />);
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );

  it("revient sur un glyphe générique pour un id inconnu, sans planter", () => {
    const { container } = render(<Icone id="ceci-n-existe-pas" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
