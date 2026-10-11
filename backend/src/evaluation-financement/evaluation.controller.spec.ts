import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { REQUIRED_ROLE } from '../roles/require-role.decorator.js';
import { RoleGuard } from '../roles/role.guard.js';
import { EvaluationController, EvaluationRevueController } from './evaluation.controller.js';

const USER = { id: 'u1', email: 'u@exemple.fr' } as never;

function monter() {
  const service = {
    demander: vi.fn().mockResolvedValue({ id: 'e1' }),
    lister: vi.fn().mockResolvedValue([]),
    pdf: vi.fn().mockResolvedValue({ fichier: Buffer.from('%PDF-'), nom: 'dossier-financement-x.pdf' }),
  };
  const revue = {
    file: vi.fn().mockResolvedValue([]),
    detail: vi.fn().mockResolvedValue({ id: 'e1' }),
    modifier: vi.fn().mockResolvedValue({ id: 'e1' }),
    valider: vi.fn().mockResolvedValue(undefined),
    faireRefaire: vi.fn().mockResolvedValue(undefined),
    refuser: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service,
    revue,
    entrepreneur: new EvaluationController(service as never),
    admin: new EvaluationRevueController(revue as never),
  };
}

describe('EvaluationController (entrepreneur)', () => {
  it('protège toutes ses routes par la connexion', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EvaluationController)).toContain(JwtAuthGuard);
  });

  it('délègue la demande et la liste avec l’identifiant de la personne connectée', async () => {
    const { entrepreneur, service } = monter();
    await entrepreneur.demander(USER, 'p1');
    await entrepreneur.lister(USER, 'p1');
    expect(service.demander).toHaveBeenCalledWith('u1', 'p1');
    expect(service.lister).toHaveBeenCalledWith('u1', 'p1');
  });

  it('envoie le PDF en pièce jointe, nommé d’après le projet', async () => {
    const { entrepreneur, service } = monter();
    const res = { set: vi.fn(), send: vi.fn() };

    await entrepreneur.pdf(USER, 'p1', 'e1', res as never);

    expect(service.pdf).toHaveBeenCalledWith('u1', 'p1', 'e1');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="dossier-financement-x.pdf"',
      }),
    );
    expect(res.send).toHaveBeenCalled();
  });
});

describe('EvaluationRevueController (administrateur)', () => {
  it('exige la connexion ET le rôle administrateur sur toute la revue', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EvaluationRevueController)).toEqual([JwtAuthGuard, RoleGuard]);
    expect(Reflect.getMetadata(REQUIRED_ROLE, EvaluationRevueController)).toBe('administrateur');
  });

  it('délègue chaque action avec l’identifiant de l’administrateur', async () => {
    const { admin, revue } = monter();
    await admin.file();
    await admin.detail('e1');
    await admin.modifier(USER, 'e1', {
      changements: [{ section: 'resume', valeur: 'x' }],
      noteIgnitux: 'n',
      version: '2026-10-11T08:00:00.000Z',
    });
    await admin.valider(USER, 'e1');
    await admin.refaire(USER, 'e1', { consigne: 'reprends' });
    await admin.refuser(USER, 'e1', { motif: 'flou' });

    expect(revue.detail).toHaveBeenCalledWith('e1');
    expect(revue.modifier).toHaveBeenCalledWith(
      'u1',
      'e1',
      [{ section: 'resume', valeur: 'x' }],
      'n',
      '2026-10-11T08:00:00.000Z',
    );
    expect(revue.valider).toHaveBeenCalledWith('u1', 'e1');
    expect(revue.faireRefaire).toHaveBeenCalledWith('u1', 'e1', 'reprends');
    expect(revue.refuser).toHaveBeenCalledWith('u1', 'e1', 'flou');
  });
});
