import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtStrategy } from './jwt.strategy.js';

// getEnv() valide process.env avec Zod et appelle process.exit(1) si la
// configuration est incomplète : inutilisable tel quel dans un test.
vi.mock('../config/env.js', () => ({ getEnv: () => ({ JWT_SECRET: 'secret-de-test' }) }));

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let users: { findUnique: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    users = { findUnique: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy, { provide: PrismaService, useValue: { users } }],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it("laisse passer une personne qui existe encore", async () => {
    users.findUnique.mockResolvedValue({ id: 'u1', email: 'camille@exemple.invalid' });

    await expect(strategy.validate({ sub: 'u1', email: 'camille@exemple.invalid' })).resolves.toEqual({
      id: 'u1',
      email: 'camille@exemple.invalid',
    });
  });

  it("refuse le jeton d'un compte qui n'existe plus", async () => {
    // Le défaut trouvé en jouant le parcours jusqu'au bout : un JWT est sans
    // état, donc l'ancien jeton d'un compte supprimé continuait d'ouvrir les
    // portes pendant vingt-quatre heures. Les tables sans clé étrangère vers
    // `users` acceptaient même ses écritures — des données créées au nom de
    // quelqu'un après qu'il a exercé son droit à l'effacement.
    users.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'compte-supprime', email: 'parti@exemple.invalid' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("interroge la base sur l'identifiant du jeton, pas sur son email", async () => {
    // L'email d'un jeton peut être périmé (changement d'adresse) ; seul le
    // `sub` désigne la personne de façon stable.
    users.findUnique.mockResolvedValue({ id: 'u1', email: 'nouvelle@exemple.invalid' });

    await strategy.validate({ sub: 'u1', email: 'ancienne@exemple.invalid' });

    expect(users.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, email: true },
    });
  });

  it("rend l'email de la base, pas celui recopié dans le jeton", async () => {
    users.findUnique.mockResolvedValue({ id: 'u1', email: 'nouvelle@exemple.invalid' });

    const resultat = await strategy.validate({ sub: 'u1', email: 'ancienne@exemple.invalid' });

    expect(resultat.email).toBe('nouvelle@exemple.invalid');
  });

  it('ne dit pas au porteur du jeton pourquoi il est refusé', async () => {
    // Distinguer « compte supprimé » de « jeton invalide » renseignerait sur
    // l'existence d'un compte à qui présente un jeton fabriqué.
    users.findUnique.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'x', email: 'y@z.invalid' })).rejects.toMatchObject({
      message: 'Unauthorized',
    });
  });
});
