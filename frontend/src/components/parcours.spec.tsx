import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JourneyRepere } from '@/lib/api';
import { TableauDeBord } from './parcours';

/**
 * LA TUILE QUI CONSTATE UN VIDE DOIT OFFRIR DE LE COMBLER.
 *
 * Trouvé par `scripts/parcours-premier-utilisateur.mjs`, pas en lisant le
 * code : la tuile « Tâches » annonçait « Aucune tâche encore. » et s'arrêtait
 * là. Le bouton pour en ajouter une existait, mais dans une section que la vue
 * simple ne montre pas — donc derrière « Vue avancée », dont le libellé ne
 * l'annonce pas.
 *
 * Ces tests tiennent les deux moitiés de la règle : l'action apparaît quand
 * elle sert, et **seulement** quand elle sert. Une action proposée à quelqu'un
 * qui n'y a pas droit est une porte qui se referme au visage.
 */
function repere(partiel: Partial<JourneyRepere>): JourneyRepere {
  return {
    cle: 'taches',
    label: 'Tâches',
    valeur: null,
    precision: 'Aucune tâche encore.',
    ...partiel,
  };
}

describe('le tableau de bord d’un projet', () => {
  it('offre d’ajouter une tâche quand il n’y en a aucune', () => {
    const surTacheVide = vi.fn();
    render(<TableauDeBord reperes={[repere({})]} surTacheVide={surTacheVide} />);

    const action = screen.getByRole('button', { name: 'Ajouter une tâche' });
    fireEvent.click(action);
    expect(surTacheVide).toHaveBeenCalledTimes(1);
  });

  it('n’offre rien quand des tâches existent déjà', () => {
    // La tuile dit alors « 1/3 » : il n'y a plus de vide à combler, et un
    // bouton de plus ne ferait qu'encombrer un chiffre qu'on vient lire.
    render(
      <TableauDeBord
        reperes={[repere({ valeur: '1/3', precision: '2 en cours.' })]}
        surTacheVide={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
  });

  it('n’offre rien à qui ne peut pas agir', () => {
    // Sans rappel — c'est ainsi que la page traite quelqu'un qui consulte le
    // projet d'un autre. Lui proposer d'ajouter une tâche serait promettre une
    // porte qui se refermera.
    render(<TableauDeBord reperes={[repere({})]} />);

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
    // Le reste de la tuile s'affiche quand même : on retire l'action, pas
    // l'information.
    expect(screen.getByText('Aucune tâche encore.')).toBeTruthy();
  });

  it('ne confond pas la tuile des tâches avec les autres', () => {
    // `valeur === null` arrive aussi pour l'Étincelle d'un projet jamais
    // analysé. Proposer « Ajouter une tâche » sous « Étincelle » serait un
    // contresens, et le genre de bogue qu'une condition trop large produit.
    render(
      <TableauDeBord
        reperes={[
          repere({ cle: 'etincelle', label: 'Étincelle', precision: 'Pas encore analysé.' }),
        ]}
        surTacheVide={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
  });
});
