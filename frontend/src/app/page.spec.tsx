import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { OFFRES_PUBLIQUES } from '@/lib/offres-publiques';
import { createRouterMock, signInAs } from '@/test-utils/mocks';
import HomePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

/**
 * La langue de l'accueil, au choix du test. `vitest.setup.ts` fixe le
 * français pour toute la suite ; ici les nouvelles sections se relisent aussi
 * en anglais et en portugais, avec les vrais fichiers de messages.
 */
const langue = vi.hoisted(() => ({ code: 'fr' as 'fr' | 'en' | 'pt' }));
vi.mock('next-intl', async () => {
  type Tree = { [key: string]: string | Tree };
  const fichiers: Record<string, Tree> = {
    fr: (await import('../../messages/fr.json')).default as Tree,
    en: (await import('../../messages/en.json')).default as Tree,
    pt: (await import('../../messages/pt.json')).default as Tree,
  };
  const lookup = (path: string): string => {
    let node: string | Tree = fichiers[langue.code];
    for (const part of path.split('.')) {
      if (typeof node === 'string' || !(part in node)) return path;
      node = node[part];
    }
    return typeof node === 'string' ? node : path;
  };
  return {
    useLocale: () => langue.code,
    useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const text = lookup(namespace ? `${namespace}.${key}` : key);
      return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
    },
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});

function afficher() {
  return render(
    <AuthProvider>
      <HomePage />
    </AuthProvider>,
  );
}

/** La section dont le titre gravé est ce texte. */
function section(titre: string): HTMLElement {
  const element = screen.getByText(titre).closest('section');
  if (!element) throw new Error(`section « ${titre} » introuvable`);
  return element;
}

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    langue.code = 'fr';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('présente la méthode et les moteurs pour un visiteur non connecté', () => {
    afficher();

    // La grande scène : IGNITUX, la devise, et les mots autour de la boussole.
    expect(screen.getByRole('heading', { level: 1, name: 'Ignitux' })).toBeInTheDocument();
    expect(screen.getByText('Des idées au monde réel')).toBeInTheDocument();
    expect(screen.getByText('Nous servir')).toBeInTheDocument();
    expect(screen.getByText('La vérité avant tout')).toBeInTheDocument();
    expect(screen.getByText('Découvrir')).toBeInTheDocument();
    expect(screen.queryByText('Transformer une idée en réalité')).not.toBeInTheDocument();
    // La boussole est un décor : tout le sens est dans le texte voisin.
    expect(document.querySelector('img.scene__boussole')).toHaveAttribute('alt', '');
    // Les mots des deux colonnes restent séparés pour un lecteur d'écran
    // (et pour l'indexation), même quand le CSS les met en ligne.
    expect(document.querySelector('.scene__cote--gauche')?.textContent).toBe(
      'Découvrir Construire Transmettre',
    );
    expect(document.querySelector('.scene__cote--droite')?.textContent).toBe(
      'Nous servir La vérité avant tout',
    );
    // L'histoire est bien posée sur l'accueil.
    expect(screen.getByText("L'histoire")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Un avenir plus grand' })).toBeInTheDocument();

    expect(screen.getByText('Analyser')).toBeInTheDocument();
    // Deux fois : la colonne de la scène et l'étape de la méthode.
    expect(screen.getAllByText('Transmettre')).toHaveLength(2);
    expect(screen.getByText('Mémoire')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    // Le texte n'apparaît qu'au clic sur l'icône.
    expect(screen.queryByText(/porteurs de projet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Communauté' }));
    expect(screen.getByText(/porteurs de projet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Communauté' }));
    expect(screen.queryByText(/porteurs de projet/)).not.toBeInTheDocument();
  });

  it('dit concrètement ce que fait Ignitux, et pour qui', () => {
    afficher();

    const concretement = section('Concrètement');
    for (const titre of [
      'IGINI analyse ton idée',
      'Forme juridique et statuts',
      'Ton dossier de création',
      'Gérer au quotidien',
      'Travailler à plusieurs',
      'Financer ton projet',
    ]) {
      expect(within(concretement).getByRole('heading', { level: 3, name: titre })).toBeInTheDocument();
    }
    // Les limites dites en clair : un brouillon, un dépôt fait par la
    // personne, une banque saisie à la main.
    expect(within(concretement).getByText(/brouillon de statuts à faire relire/)).toBeInTheDocument();
    expect(within(concretement).getByText(/ne dépose et ne paie rien à ta place/)).toBeInTheDocument();
    expect(within(concretement).getByText(/sans connexion à ta banque/)).toBeInTheDocument();

    const pourQui = section('Pour qui ?');
    expect(within(pourQui).getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(within(pourQui).getByRole('heading', { name: 'Tu as une idée' })).toBeInTheDocument();

    // Toujours un seul grand titre : celui de la scène.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('annonce les prix du catalogue, en or, sans promettre un paiement', () => {
    afficher();

    const prix = section('Combien ça coûte ?');
    const { decouverte, entrepreneur } = OFFRES_PUBLIQUES;
    expect(decouverte.prixCentimes).toBe(0);
    expect(within(prix).getByText('Gratuit')).toHaveClass('accueil-prix');
    expect(
      within(prix).getByText(`${entrepreneur.prixCentimes / 100} € / mois`),
    ).toHaveClass('accueil-prix');
    expect(
      within(prix).getByText(`${decouverte.appelsIaParMois} analyses IGINI par mois`),
    ).toBeInTheDocument();
    expect(
      within(prix).getByText(
        `Toutes les étapes d'IGINI, ${entrepreneur.appelsIaParMois} générations par mois`,
      ),
    ).toBeInTheDocument();
    // Un prix n'est pas une action : aucun bouton dans cette section.
    expect(within(prix).queryByRole('button')).not.toBeInTheDocument();
    // Rien n'encaisse : la page le dit, et ne promet ni carte ni engagement.
    expect(within(prix).getByText(/Aucun moyen de paiement n'est encore en place/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sans engagement|carte bancaire/i);
  });

  it('résume les données et renvoie à la politique de confidentialité', () => {
    afficher();

    const donnees = section('Tes données');
    expect(within(donnees).getByText(/Union européenne \(Irlande\)/)).toBeInTheDocument();
    expect(within(donnees).getByText(/jamais revendues/)).toBeInTheDocument();
    expect(within(donnees).getByText(/images de ta pièce d'identité/)).toBeInTheDocument();
    expect(within(donnees).getByText(/Anthropic/)).toBeInTheDocument();
    expect(
      within(donnees).getByRole('link', { name: 'Lire la politique de confidentialité' }),
    ).toHaveAttribute('href', '/confidentialite');
  });

  it('replie les questions fréquentes, puis mène à l’inscription', () => {
    afficher();

    const faq = section('Questions fréquentes');
    const questions = faq.querySelectorAll('details');
    expect(questions).toHaveLength(7);
    // Toutes repliées à l'arrivée : la question se lit, la réponse attend.
    for (const question of questions) {
      expect(question).not.toHaveAttribute('open');
    }
    expect(within(faq).getByText(/Pas tels quels/)).not.toBeVisible();
    expect(within(faq).getByText('Est-ce gratuit ?')).toBeVisible();
    // La réponse sur le prix reprend les chiffres du catalogue.
    expect(
      within(faq).getByText(
        new RegExp(`${OFFRES_PUBLIQUES.entrepreneur.prixCentimes / 100} € par mois`),
      ),
    ).toBeInTheDocument();

    // L'appel à créer un compte vient après la dernière question.
    const liens = screen.getAllByRole('link', { name: 'Créer un compte' });
    const dernier = liens[liens.length - 1];
    expect(dernier).toHaveAttribute('href', '/signup');
    expect(faq.compareDocumentPosition(dernier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dernier).getByRole('button')).toHaveClass('primary');
  });

  it.each([
    ['en', 'In practice', 'How much does it cost?', '€20 / month', 'Free', 'Common questions'],
    ['pt', 'Na prática', 'Quanto custa?', '20 € / mês', 'Gratuito', 'Perguntas frequentes'],
  ] as const)(
    'se lit aussi en %s, avec les mêmes prix',
    (code, concretement, combien, prixMensuel, gratuit, questions) => {
      langue.code = code;
      afficher();

      expect(section(concretement)).toBeInTheDocument();
      const prix = section(combien);
      // Le montant vient du catalogue, la mise en forme de la langue.
      expect(OFFRES_PUBLIQUES.entrepreneur.prixCentimes).toBe(2000);
      expect(within(prix).getByText(prixMensuel)).toHaveClass('accueil-prix');
      expect(within(prix).getByText(gratuit)).toHaveClass('accueil-prix');
      const faq = section(questions);
      for (const question of faq.querySelectorAll('details')) {
        expect(question).not.toHaveAttribute('open');
      }
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    },
  );

  it('redirige vers /projects si déjà connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    afficher();

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/accueil'));
  });
});
