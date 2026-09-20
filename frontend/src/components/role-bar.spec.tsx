import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyRoles, RoleDefinition } from '@/lib/api';
import { createRouterMock } from '@/test-utils/mocks';
import { RoleBar } from './role-bar';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

function role(id: string, held: boolean): RoleDefinition {
  return {
    id: id as RoleDefinition['id'],
    label: id === 'entrepreneur' ? 'Entrepreneur' : 'Investisseur',
    summary: '…',
    available: true,
    home: id === 'entrepreneur' ? '/projects' : '/investisseur',
    domains: [],
    held,
  };
}

function roles(overrides: Partial<MyRoles> = {}): MyRoles {
  return {
    roles: ['entrepreneur', 'investisseur'],
    activeRole: 'entrepreneur',
    suggestions: [],
    catalogue: [role('entrepreneur', true), role('investisseur', true)],
    ...overrides,
  };
}

describe('RoleBar', () => {
  // Un sélecteur à une seule option n'est pas un choix, c'est du bruit.
  it("ne s'affiche pas quand la personne ne tient qu'un rôle", () => {
    const { container } = render(
      <RoleBar
        roles={roles({
          roles: ['entrepreneur'],
          catalogue: [role('entrepreneur', true), role('investisseur', false)],
        })}
        onSwitch={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Les comptes crees avant les roles n en tiennent aucun : la question
  // leur est posee la ou ils sont, sans detourner leur navigation.
  it('invite a choisir quand aucun role n est tenu', () => {
    render(
      <RoleBar
        roles={roles({
          roles: [],
          activeRole: null,
          catalogue: [role('entrepreneur', false), role('investisseur', false)],
        })}
        onSwitch={vi.fn()}
      />,
    );

    expect(screen.getByText(/pas encore dit qui tu es/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Le choisir' })).toHaveAttribute('href', '/roles');
  });

  it('propose les deux modes et marque celui qui est actif', () => {
    render(<RoleBar roles={roles()} onSwitch={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Entrepreneur' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Investisseur' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it("bascule puis emmène dans l'espace du rôle choisi", async () => {
    const onSwitch = vi.fn().mockResolvedValue(roles({ activeRole: 'investisseur' }));

    render(<RoleBar roles={roles()} onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Investisseur' }));

    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith('investisseur'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/investisseur'));
  });

  // Le porteur d'un projet peut avoir enregistré un apport avant que la
  // personne n'ait coché quoi que ce soit. On le dit, on n'accorde rien.
  it("signale les données d'un rôle non pris sans l'accorder", () => {
    render(
      <RoleBar
        roles={roles({
          roles: ['entrepreneur'],
          catalogue: [role('entrepreneur', true), role('investisseur', false)],
          suggestions: [
            {
              role: 'investisseur',
              count: 2,
              detail: '2 participation(s) sont enregistrées à ton nom',
            },
          ],
        })}
        onSwitch={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 participation\(s\) sont enregistrées/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Investisseur' })).toBeNull();
  });

  // Un serveur d'une version antérieure ne doit pas blanchir la page qui
  // porte ce bandeau : il disparaît, le reste de l'espace fonctionne.
  it('disparaît sans planter devant une réponse malformée', () => {
    const { container } = render(
      <RoleBar roles={{ roles: [] } as unknown as MyRoles} onSwitch={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
