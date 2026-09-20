import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileField } from '@/lib/api';
import { mockApiRoutes } from '@/test-utils/mocks';
import { ChampsADemander } from './champs-profil';

const PAYS: ProfileField = {
  id: 'activity_country',
  label: "Pays d'activité",
  question: 'Dans quel pays ton activité se déroulera-t-elle ?',
  purpose: 'Les obligations légales dépendent du pays, pas de ta nationalité.',
  unlocks: 'La section Conformité, qui affiche des démarches françaises à tout le monde.',
  roles: ['entrepreneur'],
  moment: 'premier-projet',
  kind: 'choix',
  options: ['France'],
  countsTowardCompletion: true,
};

const SECTEURS: ProfileField = {
  id: 'sectors',
  label: 'Secteurs que tu connais',
  question: 'Dans quels secteurs as-tu déjà travaillé ?',
  purpose: "IGINI calibre son analyse selon ce que tu connais déjà du métier.",
  unlocks: null,
  roles: ['entrepreneur'],
  moment: 'premier-projet',
  kind: 'liste',
  options: ['Transport', 'Commerce'],
  countsTowardCompletion: true,
};

describe('ChampsADemander', () => {
  beforeEach(() => {
    mockApiRoutes({ 'PUT /profil': { status: 200, body: { values: {}, completion: {}, fields: [] } } });
  });

  // La règle du module : un champ qui ne dit pas à quoi il sert n'existe pas.
  it('affiche toujours la raison du champ', () => {
    render(
      <ChampsADemander token="t" champs={[PAYS]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    expect(screen.getByText(/obligations légales dépendent du pays/)).toBeInTheDocument();
  });

  // « Ton pays d'activité » ne motive personne ; ce que ça ouvre, si.
  it('dit ce que le champ débloque quand il débloque quelque chose', () => {
    render(
      <ChampsADemander token="t" champs={[PAYS]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    expect(screen.getByText(/Ce que ça ouvre/)).toBeInTheDocument();
    expect(screen.getByText(/section Conformité/)).toBeInTheDocument();
  });

  // Rien ne bloque : c'est ce qui distingue une question d'un péage.
  it('annonce que répondre peut attendre', () => {
    render(
      <ChampsADemander token="t" champs={[PAYS]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    expect(screen.getByText(/tu peux répondre plus tard, rien ne bloque/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
  });

  // Reposer une question à quelqu'un qui a déjà dit non une fois, c'est
  // harceler.
  it('ne repose pas la question après « Plus tard »', () => {
    render(
      <ChampsADemander token="t" champs={[PAYS]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));

    expect(screen.queryByText(/Dans quel pays/)).toBeNull();
  });

  it('ne s’affiche pas du tout quand il n’y a rien à demander', () => {
    const { container } = render(
      <ChampsADemander token="t" champs={[]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('enregistre les réponses saisies', async () => {
    const onEnregistre = vi.fn();
    render(
      <ChampsADemander
        token="t"
        champs={[PAYS, SECTEURS]}
        titre="Deux choses"
        onEnregistre={onEnregistre}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Dans quel pays/), { target: { value: 'France' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const envoi = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[1]?.method === 'PUT',
      );
      expect(envoi).toBeDefined();
      const corps = JSON.parse(String(envoi![1].body));
      expect(corps.values.activity_country).toBe('France');
      expect(corps.values.sectors).toEqual(['Transport']);
    });
    await waitFor(() => expect(onEnregistre).toHaveBeenCalled());
  });

  // Une liste se coche et se décoche : un choix de trop doit pouvoir partir.
  it('permet de retirer un choix de liste', () => {
    render(
      <ChampsADemander token="t" champs={[SECTEURS]} titre="Deux choses" onEnregistre={vi.fn()} />,
    );

    const transport = screen.getByRole('button', { name: 'Transport' });
    fireEvent.click(transport);
    expect(transport).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(transport);
    expect(transport).toHaveAttribute('aria-pressed', 'false');
  });
});
