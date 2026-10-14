import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { CollaboratorsSection } from './collaborators-section';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CollaboratorsSection', () => {
  it('liste les collaborateurs existants', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it("affiche un message quand il n'y a aucun collaborateur", async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [] } });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText("Aucun collaborateur pour l'instant.")).toBeInTheDocument();
  });

  it('invite un collaborateur par email', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 201,
        body: {
          id: 'pc1',
          project_id: 'p1',
          user_id: 'u2',
          created_at: '2026-01-01T00:00:00.000Z',
          user: { id: 'u2', email: 'b@b.com' },
        },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'b@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
  });

  it('retire un collaborateur', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': {
        status: 200,
        body: [
          {
            id: 'pc1',
            project_id: 'p1',
            user_id: 'u2',
            created_at: '2026-01-01T00:00:00.000Z',
            user: { id: 'u2', email: 'b@b.com' },
          },
        ],
      },
      'DELETE /projects/p1/collaborators/u2': { status: 204, body: null },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('b@b.com');
    fireEvent.click(screen.getByRole('button', { name: /retirer/i }));

    await screen.findByText("Aucun collaborateur pour l'instant.");
  });

  it("affiche une erreur si l'invitation échoue", async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': {
        status: 404,
        body: { message: 'Aucun compte ne correspond à cet email.' },
      },
    });

    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), {
      target: { value: 'inconnu@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    expect(await screen.findByText('Aucun compte ne correspond à cet email.')).toBeInTheDocument();
  });

  const MEMBRE = {
    id: 'pc1',
    project_id: 'p1',
    user_id: 'u2',
    created_at: '2026-01-01T00:00:00.000Z',
    role: 'salarie',
    user: { id: 'u2', email: 'b@b.com' },
  };

  function appels(methode: string, chemin: string) {
    return vi
      .mocked(global.fetch)
      .mock.calls.filter(([url, o]) => new URL(String(url)).pathname === chemin && (o?.method ?? 'GET') === methode);
  }

  it('invite avec le rôle choisi et explique ce que ce rôle permet', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [] },
      'POST /projects/p1/collaborators': { status: 201, body: MEMBRE },
    });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText("Aucun collaborateur pour l'instant.");
    fireEvent.change(screen.getByLabelText('Rôle de la personne invitée'), { target: { value: 'salarie' } });
    expect(screen.getByText(/travaille sur les tâches/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email du collaborateur à ajouter'), { target: { value: 'b@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /inviter/i }));

    await screen.findByText('b@b.com');
    expect(JSON.parse(String(appels('POST', '/projects/p1/collaborators')[0][1]?.body))).toEqual({
      email: 'b@b.com',
      role: 'salarie',
    });
  });

  it('change le rôle d’un membre', async () => {
    mockApiRoutes({
      'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] },
      'PATCH /projects/p1/collaborators/u2': { status: 204, body: null },
    });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);

    fireEvent.change(await screen.findByLabelText('Rôle de b@b.com'), { target: { value: 'comptable' } });

    await waitFor(() => expect(appels('PATCH', '/projects/p1/collaborators/u2')).toHaveLength(1));
    expect(JSON.parse(String(appels('PATCH', '/projects/p1/collaborators/u2')[0][1]?.body))).toEqual({
      role: 'comptable',
    });
  });

  it('montre l’équipe et les rôles à un membre, sans aucune action', async () => {
    mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] } });
    render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} peutGerer={false} />);

    expect(await screen.findByText('b@b.com')).toBeInTheDocument();
    expect(screen.getByText('Salarié')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  describe('« Activité de mon équipe dans mon argent » (propriétaire, lecture seule)', () => {
    const ACTIVITE = [
      { date: '2026-10-14T10:00:00.000Z', acteur: 'Bob', methode: 'POST', chemin: '/caisse/journees', statut: 201 },
      { date: '2026-10-13T09:00:00.000Z', acteur: 'un membre', methode: 'PATCH', chemin: '/billing/documents/d1', statut: 422 },
    ];
    const lectures = () =>
      (global.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.endsWith('/espaces/activite'));

    it('rien n’est chargé tant qu’on ne l’ouvre pas, puis la liste s’affiche, la plus récente d’abord', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 200, body: ACTIVITE },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      await screen.findByText("Aucun collaborateur pour l'instant.");
      expect(lectures()).toHaveLength(0);

      const bouton = screen.getByRole('button', { name: 'Activité de mon équipe dans mon argent' });
      expect(bouton).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(bouton);

      const liste = await screen.findByRole('list', { name: 'Activité de mon équipe dans mon argent' });
      const lignes = within(liste).getAllByRole('listitem');
      expect(lignes).toHaveLength(2);
      expect(lignes[0]).toHaveTextContent('Bob');
      expect(lignes[0]).toHaveTextContent('POST /caisse/journees');
      expect(lignes[0]).toHaveTextContent('201');
      expect(lignes[1]).toHaveTextContent('un membre');
      expect(lignes[1]).toHaveTextContent('PATCH /billing/documents/d1');
      expect(lignes[1]).toHaveTextContent('422');
      expect(bouton).toHaveAttribute('aria-expanded', 'true');
      expect(lectures()).toHaveLength(1);
    });

    it('journal vide : un message, aucune action proposée sur les lignes', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 200, body: [] },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Activité de mon équipe dans mon argent' }));
      expect(await screen.findByText('Aucune activité de ton équipe dans ton argent pour l’instant.')).toBeInTheDocument();
    });

    it('un échec du serveur est dit, sans casser la section', async () => {
      mockApiRoutes({
        'GET /projects/p1/collaborators': { status: 200, body: [] },
        'GET /espaces/activite': { status: 403, body: { message: 'Refusé.' } },
      });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Activité de mon équipe dans mon argent' }));
      expect(await screen.findByText('Refusé.')).toBeInTheDocument();
    });

    it('un membre ne la voit pas', async () => {
      mockApiRoutes({ 'GET /projects/p1/collaborators': { status: 200, body: [MEMBRE] } });
      render(<CollaboratorsSection token={TOKEN} projectId={PROJECT_ID} peutGerer={false} />);
      await screen.findByText('b@b.com');
      expect(screen.queryByText('Activité de mon équipe dans mon argent')).not.toBeInTheDocument();
    });
  });
});
