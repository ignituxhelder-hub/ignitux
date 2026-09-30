import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estSafariIos } from '@/lib/installation';
import { InvitationInstallation } from './invitation-installation';

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_IPAD_BUREAU =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const UA_CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('estSafariIos', () => {
  it('reconnaît Safari sur iPhone', () => {
    expect(estSafariIos(UA_IPHONE, 5)).toBe(true);
  });

  // Un iPad récent se présente comme un Mac : seul l'écran tactile le trahit.
  it('reconnaît un iPad qui se dit Mac, mais pas un vrai Mac', () => {
    expect(estSafariIos(UA_IPAD_BUREAU, 5)).toBe(true);
    expect(estSafariIos(UA_IPAD_BUREAU, 0)).toBe(false);
  });

  it('écarte Chrome sur iOS, dont le menu n’est pas celui de Safari', () => {
    expect(estSafariIos(UA_CHROME_IOS, 5)).toBe(false);
  });

  it('écarte Android', () => {
    expect(estSafariIos(UA_ANDROID, 5)).toBe(false);
  });
});

function simulerNavigateur(ua: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  // jsdom ne connaît pas `maxTouchPoints` : on le définit plutôt qu'on ne l'espionne.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  window.matchMedia = vi.fn().mockImplementation((requete: string) => ({
    matches: standalone && requete.includes('standalone'),
    media: requete,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('InvitationInstallation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('explique le chemin Partager → écran d’accueil sur Safari iOS', async () => {
    simulerNavigateur(UA_IPHONE);
    render(<InvitationInstallation />);
    expect(await screen.findByText(/Installe Ignitux sur cet appareil/)).toBeInTheDocument();
    expect(screen.getByText('Partager')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument();
  });

  it('ne propose rien quand Ignitux est déjà ouverte comme application', () => {
    simulerNavigateur(UA_IPHONE, true);
    render(<InvitationInstallation />);
    expect(screen.queryByText(/Installe Ignitux/)).not.toBeInTheDocument();
  });

  it('ne propose rien à un navigateur qui ne sait pas installer', () => {
    simulerNavigateur(UA_ANDROID);
    render(<InvitationInstallation />);
    expect(screen.queryByText(/Installe Ignitux/)).not.toBeInTheDocument();
  });

  it('montre « Installer » quand Chrome ou Edge annonce que c’est possible, et ouvre sa fenêtre', async () => {
    simulerNavigateur(UA_ANDROID);
    render(<InvitationInstallation />);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const evenement = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => {
      window.dispatchEvent(evenement);
    });

    // La mini-barre automatique de Chrome est remplacée par notre bouton.
    expect(evenement.defaultPrevented).toBe(true);
    const bouton = await screen.findByRole('button', { name: 'Installer' });
    await act(async () => {
      fireEvent.click(bouton);
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('« Plus tard » la fait taire sur cet appareil', async () => {
    simulerNavigateur(UA_IPHONE);
    const { unmount } = render(<InvitationInstallation />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByText(/Installe Ignitux/)).not.toBeInTheDocument();
    unmount();

    render(<InvitationInstallation />);
    await act(async () => {});
    expect(screen.queryByText(/Installe Ignitux/)).not.toBeInTheDocument();
  });
});
