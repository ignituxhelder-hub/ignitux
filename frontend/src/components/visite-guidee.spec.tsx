import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLE_VISITE_PROJET,
  marquerVisiteVue,
  VisiteGuidee,
  visiteDejaVue,
  type ArretVisite,
} from './visite-guidee';

const ARRETS: ArretVisite[] = [
  { cible: 'a', titre: 'Arrêt A', texte: 'Texte A' },
  { cible: 'b', titre: 'Arrêt B', texte: 'Texte B' },
  { cible: 'absent', titre: 'Arrêt absent', texte: 'Jamais vu' },
  { cible: 'c', titre: 'Arrêt C', texte: 'Texte C' },
];

function Page({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  return (
    <>
      <div data-visite="a">A</div>
      <div data-visite="b">B</div>
      <div data-visite="c">C</div>
      <VisiteGuidee arrets={ARRETS} ouverte={ouverte} onFermer={onFermer} />
    </>
  );
}

describe('la visite guidée', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('s’ouvre sur le premier arrêt et saute ceux qui ne sont pas à l’écran', () => {
    render(<Page ouverte onFermer={() => {}} />);
    const bulle = screen.getByRole('dialog', { name: 'Arrêt A' });
    expect(bulle).toHaveTextContent('Texte A');
    expect(bulle).toHaveTextContent('1/3');
  });

  it('avance et recule avec les boutons et les flèches', () => {
    render(<Page ouverte onFermer={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('dialog', { name: 'Arrêt B' })).toHaveTextContent('2/3');
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(screen.getByRole('dialog', { name: 'Arrêt A' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Arrêt B' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Arrêt A' })).toBeInTheDocument();
  });

  it('se termine au dernier arrêt', () => {
    const onFermer = vi.fn();
    render(<Page ouverte onFermer={onFermer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(onFermer).toHaveBeenCalledTimes(1);
  });

  it('se ferme avec « Passer la visite » ou Échap', () => {
    const onFermer = vi.fn();
    render(<Page ouverte onFermer={onFermer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Passer la visite' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(2);
  });

  it('ne revient pas au début quand la page se réaffiche', () => {
    const { rerender } = render(<Page ouverte onFermer={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    rerender(<Page ouverte onFermer={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Arrêt B' })).toBeInTheDocument();
  });

  // Sur un téléphone, une zone plus haute que l'écran ne laisse de place ni
  // dessous ni dessus : la bulle s'épingle en bas plutôt que de sortir de
  // l'écran avec le seul bouton de sortie.
  it('garde la bulle à l’écran quand la zone est plus haute que lui', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: -100,
      left: 0,
      width: 300,
      height: 1200,
      bottom: 1100,
      right: 300,
      x: 0,
      y: -100,
      toJSON: () => ({}),
    });
    render(<Page ouverte onFermer={() => {}} />);
    const bulle = screen.getByRole('dialog');
    expect(bulle.style.bottom).toBe('16px');
    expect(bulle.style.top).toBe('');
  });

  it('met le focus dans la bulle', () => {
    render(<Page ouverte onFermer={() => {}} />);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('ne montre rien quand elle est fermée', () => {
    render(<Page ouverte={false} onFermer={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se referme d’elle-même si aucun arrêt n’est à l’écran', () => {
    const onFermer = vi.fn();
    render(<VisiteGuidee arrets={ARRETS} ouverte onFermer={onFermer} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onFermer).toHaveBeenCalled();
  });
});

describe('le souvenir de la visite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('se souvient qu’elle a été vue', () => {
    expect(visiteDejaVue()).toBe(false);
    marquerVisiteVue();
    expect(visiteDejaVue()).toBe(true);
    expect(window.localStorage.getItem(CLE_VISITE_PROJET)).not.toBeNull();
  });

  it('sans stockage, ne relance pas la visite et ne plante pas', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    expect(visiteDejaVue()).toBe(true);
    expect(() => marquerVisiteVue()).not.toThrow();
  });
});
