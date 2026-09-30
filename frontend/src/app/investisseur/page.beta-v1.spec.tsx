import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import InvestorSpacePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('InvestorSpacePage — périmètre de la bêta V1', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });
  });

  it('redirige vers /accueil pendant la bêta V1, sans appeler le service', async () => {
    mockApiRoutes({});

    render(
      <AuthProvider>
        <InvestorSpacePage />
      </AuthProvider>,
    );

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/accueil'));
  });
});
