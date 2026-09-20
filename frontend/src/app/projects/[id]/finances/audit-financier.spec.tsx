import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApiRoutes } from '@/test-utils/mocks';
import { AuditFinancier } from './audit-financier';

const TOKEN = 'tok123';
const PROJECT_ID = 'p1';

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTROLE = (code: string, count: number, sample: string[] = []) => ({
  code,
  label: `Contrôle ${code}`,
  why: `Raison du contrôle ${code}.`,
  count,
  sample,
});

function auditAvec(findings: ReturnType<typeof CONTROLE>[]) {
  mockApiRoutes({
    'GET /projects/p1/audit-financier': {
      status: 200,
      body: {
        checkedAt: '2026-09-20T12:00:00.000Z',
        findings,
        clean: findings.every((f) => f.count === 0),
      },
    },
  });
}

describe('AuditFinancier', () => {
  // La propriété qui justifie l'écran : « rien à signaler » et « ce
  // contrôle n'existe pas » doivent cesser de se ressembler.
  it('affiche aussi les contrôles qui n’ont rien trouvé', async () => {
    auditAvec([CONTROLE('a', 0), CONTROLE('b', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Contrôle a')).toBeInTheDocument();
    expect(screen.getByText('Contrôle b')).toBeInTheDocument();
    expect(screen.getAllByText('rien à signaler')).toHaveLength(2);
  });

  it('annonce le nombre de contrôles passés quand tout va bien', async () => {
    auditAvec([CONTROLE('a', 0), CONTROLE('b', 0), CONTROLE('c', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/3 contrôles passés, aucun écart/)).toBeInTheDocument();
  });

  // Une page verte ne doit pas se lire comme une certification comptable.
  it('dit ce que les contrôles ne vérifient pas', async () => {
    auditAvec([CONTROLE('a', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/pas une certification comptable/)).toBeInTheDocument();
  });

  it('détaille le pourquoi et des exemples sur un écart', async () => {
    auditAvec([CONTROLE('a', 3, ['e1', 'e2'])]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('3 à regarder')).toBeInTheDocument();
    expect(screen.getByText('Raison du contrôle a.')).toBeInTheDocument();
    expect(screen.getByText(/e1, e2/)).toBeInTheDocument();
    expect(screen.getByText(/et 1 autre/)).toBeInTheDocument();
  });

  // Le « pourquoi » répété douze fois noierait la seule ligne qui compte.
  it('n’affiche pas le pourquoi des contrôles sans écart', async () => {
    auditAvec([CONTROLE('a', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    await screen.findByText('Contrôle a');
    expect(screen.queryByText('Raison du contrôle a.')).not.toBeInTheDocument();
  });

  // Rien n'est corrigé automatiquement : une écriture financière se
  // rectifie par une écriture, et le dire évite d'attendre une réparation.
  it('dit que rien n’a été corrigé tout seul', async () => {
    auditAvec([CONTROLE('a', 1), CONTROLE('b', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/n'a été corrigé automatiquement|n’a été corrigé automatiquement/))
      .toBeInTheDocument();
  });

  it('compte les contrôles en écart, pas les écarts', async () => {
    auditAvec([CONTROLE('a', 7), CONTROLE('b', 0), CONTROLE('c', 2)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText(/2 contrôles sur 3 signalent un écart/)).toBeInTheDocument();
  });

  it('affiche une erreur lisible si les contrôles ne répondent pas', async () => {
    mockApiRoutes({
      'GET /projects/p1/audit-financier': { status: 500, body: { message: 'Base indisponible.' } },
    });

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    expect(await screen.findByText('Base indisponible.')).toBeInTheDocument();
  });

  it('range chaque contrôle dans sa propre ligne', async () => {
    auditAvec([CONTROLE('a', 1, ['x']), CONTROLE('b', 0)]);

    render(<AuditFinancier token={TOKEN} projectId={PROJECT_ID} />);

    const lignes = await screen.findAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(within(lignes[0]).getByText('1 à regarder')).toBeInTheDocument();
  });
});
