import { ForbiddenException } from '@nestjs/common';

const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock('./env.js', () => ({ getEnv: () => env.current }));

import { BetaV1Guard } from './beta-v1.guard.js';

describe('BetaV1Guard — le vrai garde, côté serveur', () => {
  let guard: BetaV1Guard;

  beforeEach(() => {
    env.current = {};
    guard = new BetaV1Guard();
  });

  it('refuse par défaut, pendant la bêta', () => {
    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });

  it("laisse passer quand IGNITUX_BETA_V1='false'", () => {
    env.current = { IGNITUX_BETA_V1: 'false' };
    expect(guard.canActivate()).toBe(true);
  });
});
