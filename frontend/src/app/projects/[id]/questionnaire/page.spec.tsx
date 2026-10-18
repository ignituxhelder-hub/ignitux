import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Questionnaire } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import QuestionnairePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ id: 'p1' }),
}));

const QUESTIONNAIRE: Questionnaire = {
  etapes: [
    { id: 'projet', titre: 'Le projet', intro: 'Créer ou reprendre.' },
    { id: 'equipe', titre: 'L’équipe et la protection', intro: 'La forme juridique.' },
  ],
  questions: [
    {
      id: 'nature',
      etape: 'projet',
      label: 'Nature du projet',
      question: 'S’agit-il d’une nouvelle entreprise ?',
      purpose: 'Trois parcours différents.',
      kind: 'choix',
      options: ['Nouvelle entreprise à créer', 'Une structure existe déjà'],
    },
    {
      id: 'forme_existante',
      etape: 'projet',
      label: 'Forme juridique actuelle',
      question: 'Quelle est sa forme juridique aujourd’hui ?',
      purpose: 'Pour ne pas recréer ce qui existe.',
      kind: 'choix',
      options: ['SARL', 'SAS'],
      visibleSi: { question: 'nature', parmi: ['Une structure existe déjà'] },
    },
    {
      id: 'associes',
      etape: 'equipe',
      label: 'Associés',
      question: 'Tu te lances seul ou à plusieurs ?',
      purpose: 'Premier critère de la forme.',
      kind: 'choix',
      options: ['Seul', 'Avec 1 associé'],
    },
  ],
  reponses: {},
  termine: false,
  questionsIginiPreparees: false,
  questionsIgini: [],
};

const AVEC_IDEE: Questionnaire = {
  ...QUESTIONNAIRE,
  etapes: [{ id: 'idee', titre: 'Ton idée', intro: 'Quelques phrases suffisent.' }, ...QUESTIONNAIRE.etapes],
  questions: [
    {
      id: 'probleme',
      etape: 'idee',
      label: 'Problème réglé',
      question: 'Quel problème règles-tu ?',
      purpose: 'IGINI part de là.',
      kind: 'texte-long',
      longueurMax: 500,
    },
    ...QUESTIONNAIRE.questions,
  ],
};

const PROFIL_COMPLET = {
  values: {
    current_situation: 'Salarié',
    has_founded_before: 'Non',
    skills: ['Vente'],
    availability: 'À plein temps',
  },
  completion: { percent: 100, filled: 1, total: 1, missing: [] },
  fields: [],
};

const CV_REMPLI = {
  experiences: [
    { poste: 'Vendeur', entreprise: null, debut: null, fin: null, enCours: true, description: null },
  ],
  formations: [],
};

function routes(extra: Record<string, { status: number; body: unknown }> = {}) {
  mockApiRoutes({
    'GET /projects/p1/questionnaire': { status: 200, body: QUESTIONNAIRE },
    'PUT /projects/p1/questionnaire': { status: 200, body: QUESTIONNAIRE },
    'GET /profil': { status: 200, body: PROFIL_COMPLET },
    'GET /profil/cv': { status: 200, body: CV_REMPLI },
    'POST /projects/p1/questionnaire/questions-igini': {
      status: 200,
      body: {
        ...QUESTIONNAIRE,
        questionsIginiPreparees: true,
        questionsIgini: [
          { id: 'q1', question: 'Où sera le camion ?', pourquoi: 'Les aides sont locales.', reponse: null },
        ],
      },
    },
    'PUT /projects/p1/questionnaire/questions-igini': { status: 200, body: QUESTIONNAIRE },
    ...extra,
  });
}

function rendre() {
  return render(
    <AuthProvider>
      <QuestionnairePage />
    </AuthProvider>,
  );
}

function appels(methode: string, chemin: string) {
  return (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (appel: unknown[]) => {
      const [url, options] = appel as [string, RequestInit | undefined];
      return (options?.method ?? 'GET') === methode && new URL(url).pathname === chemin;
    },
  );
}

describe('le questionnaire du projet, étape par étape', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs('jeton', { id: 'u1', email: 'a@b.fr' });
    router.push.mockClear();
  });

  it('saute le CV et la situation quand le profil les connaît déjà', async () => {
    routes();
    rendre();
    expect(await screen.findByRole('heading', { name: 'Le projet' })).toBeInTheDocument();
    // 1 (l'idée) + 2 étapes de projet + les questions d'IGINI = 4.
    expect(screen.getByText('Étape 2 sur 4')).toBeInTheDocument();
  });

  it('commence par le CV quand il est vide', async () => {
    routes({ 'GET /profil/cv': { status: 200, body: { experiences: [], formations: [] } } });
    rendre();
    expect(await screen.findByRole('heading', { name: 'Ton parcours' })).toBeInTheDocument();
    expect(screen.getByText('Étape 2 sur 5')).toBeInTheDocument();
  });

  it('commence par l’idée, avant le CV : elle vient d’être décrite', async () => {
    routes({
      'GET /projects/p1/questionnaire': { status: 200, body: AVEC_IDEE },
      'GET /profil/cv': { status: 200, body: { experiences: [], formations: [] } },
    });
    rendre();
    expect(await screen.findByRole('heading', { name: 'Ton idée' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByRole('heading', { name: 'Ton parcours' })).toBeInTheDocument();
  });

  it('laisse quelques phrases pour l’idée, dans la limite que le serveur garde', async () => {
    routes({ 'GET /projects/p1/questionnaire': { status: 200, body: AVEC_IDEE } });
    rendre();
    const champ = await screen.findByLabelText('Quel problème règles-tu ?');
    expect(champ.tagName).toBe('TEXTAREA');
    expect(champ).toHaveAttribute('maxLength', '500');
  });

  it('ne montre une question conditionnelle qu’au bon moment', async () => {
    routes();
    rendre();
    await screen.findByRole('heading', { name: 'Le projet' });
    expect(screen.queryByText('Quelle est sa forme juridique aujourd’hui ?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Une structure existe déjà' }));
    expect(screen.getByText('Quelle est sa forme juridique aujourd’hui ?')).toBeInTheDocument();
  });

  it('enregistre l’étape en passant à la suivante', async () => {
    routes();
    rendre();
    await screen.findByRole('heading', { name: 'Le projet' });
    fireEvent.click(screen.getByRole('radio', { name: 'Nouvelle entreprise à créer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(await screen.findByRole('heading', { name: 'L’équipe et la protection' })).toBeInTheDocument();
    const [, options] = appels('PUT', '/projects/p1/questionnaire')[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      reponses: { nature: 'Nouvelle entreprise à créer', forme_existante: null },
    });
  });

  it('se quitte à tout moment, en enregistrant', async () => {
    routes();
    rendre();
    await screen.findByRole('heading', { name: 'Le projet' });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer plus tard' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/p1'));
    expect(appels('PUT', '/projects/p1/questionnaire')).toHaveLength(1);
  });

  it('finit sur les questions d’IGINI, puis retourne au projet', async () => {
    routes();
    rendre();
    await screen.findByRole('heading', { name: 'Le projet' });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await screen.findByRole('heading', { name: 'L’équipe et la protection' });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    const champ = await screen.findByLabelText('Où sera le camion ?');
    fireEvent.change(champ, { target: { value: 'À Villeurbanne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/p1'));
    const [, options] = appels('PUT', '/projects/p1/questionnaire/questions-igini')[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(options.body as string)).toEqual({
      reponses: [{ id: 'q1', reponse: 'À Villeurbanne' }],
    });
  });

  it('termine sans bloquer quand IGINI ne peut pas préparer ses questions', async () => {
    routes({
      'POST /projects/p1/questionnaire/questions-igini': {
        status: 503,
        body: { message: 'IA coupée' },
      },
    });
    rendre();
    await screen.findByRole('heading', { name: 'Le projet' });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await screen.findByRole('heading', { name: 'L’équipe et la protection' });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(await screen.findByText(/n'a pas pu préparer ses questions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/projects/p1'));
  });
});
