import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { BAREME_PUBLIC } from '@/lib/bareme-public';
import { OUTILS_RECOMMANDES } from '@/lib/outils-recommandes';
import { createRouterMock, mockApiRoutes, signInAs } from '@/test-utils/mocks';
import HomePage from './page';

const router = createRouterMock();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

/**
 * La langue de l'accueil, au choix du test. `vitest.setup.ts` fixe le
 * français pour toute la suite ; ici les sections se relisent aussi en
 * anglais et en portugais, avec les vrais fichiers de messages.
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

/** La section dont le titre est ce texte. */
function section(titre: string): HTMLElement {
  const element = screen.getByRole('heading', { level: 2, name: titre }).closest('section');
  if (!element) throw new Error(`section « ${titre} » introuvable`);
  return element;
}

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockClear();
    langue.code = 'fr';
    // Sous 50 projets, le serveur ne donne aucun chiffre.
    mockApiRoutes({ 'GET /vitrine/compteur': { status: 200, body: { projets: null } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ouvre sur la promesse : de l’idée à l’entreprise, avec IGINI', () => {
    afficher();

    // La promesse est le seul grand titre ; le nom reste gravé au-dessus.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: "De l'idée à l'entreprise." })).toBeInTheDocument();
    expect(document.querySelector('.scene__nom')?.textContent).toBe('Ignitux');
    expect(document.querySelector('.scene__sous-titre')?.textContent).toBe(
      "IGINI t'accompagne à chaque étape : analyser ton idée, créer ta société en France, construire ton plan, et avancer sereinement. Les outils de gestion sont là quand tu en as besoin. Les meilleurs outils du marché aussi.",
    );
    // La boussole est un décor : tout le sens est dans le texte voisin, et
    // les mots des deux colonnes restent séparés pour un lecteur d'écran.
    expect(document.querySelector('img.scene__boussole')).toHaveAttribute('alt', '');
    expect(document.querySelector('.scene__cote--gauche')?.textContent).toBe('Découvrir Construire Transmettre');
    expect(document.querySelector('.scene__cote--droite')?.textContent).toBe('Nous servir La vérité avant tout');

    // Le bouton fort mène à l'inscription.
    const scene = document.querySelector('.scene') as HTMLElement;
    const inscription = within(scene).getByRole('link', { name: 'Créer mon compte gratuitement' });
    expect(inscription).toHaveAttribute('href', '/signup');
    expect(within(inscription).getByRole('button')).toHaveClass('primary');
  });

  it('pose le bandeau de réassurance, sans promettre d’abonnement facultatif', () => {
    afficher();

    const bandeau = screen.getByRole('list', { name: "L'essentiel" });
    expect(within(bandeau).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Sans abonnement',
      `${BAREME_PUBLIC.bienvenue} crédits offerts`,
      'Tu restes maître de tes décisions',
    ]);
    // Aucun abonnement n'existe, même facultatif : « obligatoire » ferait
    // croire le contraire.
    expect(document.body.textContent).not.toMatch(/abonnement obligatoire/i);
  });

  it('n’affiche le compteur de projets que lorsque le serveur en donne un', async () => {
    mockApiRoutes({ 'GET /vitrine/compteur': { status: 200, body: { projets: 120 } } });
    afficher();

    expect(await screen.findByText('Déjà 120 projets sur Ignitux')).toBeInTheDocument();
  });

  it('se passe du compteur sous le seuil, sans réponse lisible ou sans serveur', async () => {
    for (const body of [{ projets: null }, {}, []]) {
      mockApiRoutes({ 'GET /vitrine/compteur': { status: 200, body } });
      const { unmount } = afficher();
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.queryByText(/^Déjà .* projets/)).not.toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
      unmount();
    }

    mockApiRoutes({ 'GET /vitrine/compteur': { status: 500, body: { message: 'Erreur' } } });
    afficher();
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/^Déjà .* projets/)).not.toBeInTheDocument();
  });

  it('suit l’ordre décidé, section par section', () => {
    afficher();

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Le parcours',
      "Ce qu'IGINI fait concrètement",
      'Pour qui ?',
      'Tes outils de gestion',
      'Combien ça coûte ?',
      'Transparence',
      'Questions fréquentes',
      'Prêt à donner vie à ton idée ?',
    ]);
  });

  it('montre le parcours en quatre étapes, dans l’ordre', () => {
    afficher();

    const parcours = section('Le parcours');
    expect(within(parcours).getByRole('list').tagName).toBe('OL');
    expect(within(parcours).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Analyser',
      "Créer l'entreprise",
      'Construire et financer',
      'Avancer au quotidien',
    ]);
  });

  it('dit ce qu’IGINI fait, sans faire de la gestion le cœur du produit', () => {
    afficher();

    const concret = section("Ce qu'IGINI fait concrètement");
    expect(within(concret).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Analyser ton idée',
      'Créer ta société en France',
      'Construire ton plan',
      'Se souvenir de ton projet',
    ]);
    // Les limites dites en clair : un brouillon, un dépôt fait par la personne.
    expect(within(concret).getByText(/brouillon de statuts à faire relire/)).toBeInTheDocument();
    expect(within(concret).getByText(/ne dépose et ne paie rien à ta place/)).toBeInTheDocument();
    // Le cœur, c'est IGINI : ni compta, ni factures, ni banque, ni stocks ici.
    expect(concret.textContent).not.toMatch(/comptab|factur|banque|stock/i);
    expect(section('Le parcours').textContent).not.toMatch(/comptab|factur|banque|stock/i);

    // L'aperçu d'une analyse : la forme réelle (note sur 10), sur un projet
    // dit fictif.
    const apercu = within(concret).getByRole('figure');
    expect(within(apercu).getByText('7/10')).toHaveClass('apercu__note-valeur');
    expect(within(apercu).getByText(/projet fictif/)).toBeInTheDocument();

    const pourQui = section('Pour qui ?');
    expect(within(pourQui).getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });

  it('présente les outils internes comme la version simple, et recommande les outils spécialisés sans se dire partenaire', () => {
    afficher();

    const outils = section('Tes outils de gestion');
    expect(within(outils).getByRole('heading', { level: 3, name: 'Inclus dans Ignitux' })).toBeInTheDocument();
    expect(within(outils).getByText('La version simple, gratuite')).toBeInTheDocument();
    expect(within(outils).getByText(/ne remplacent ni un outil spécialisé ni ton expert-comptable/)).toBeInTheDocument();

    expect(OUTILS_RECOMMANDES.map((o) => o.nom)).toEqual(['Pennylane', 'Qonto', 'Shine']);
    for (const outil of OUTILS_RECOMMANDES) {
      expect(within(outils).getByRole('heading', { level: 4, name: outil.nom })).toBeInTheDocument();
      const lien = within(outils).getByRole('link', { name: new RegExp(outil.nom, 'i') });
      expect(lien).toHaveAttribute('href', outil.url);
      // Un site extérieur s'ouvre à part, sans accès à la page d'Ignitux, et
      // le lecteur d'écran l'annonce.
      expect(lien).toHaveAttribute('target', '_blank');
      expect(lien.getAttribute('rel')).toContain('noopener');
      expect(lien.textContent).toContain('(nouvel onglet)');
    }

    // Des recommandations, pas des partenaires : aucun accord, et c'est dit.
    expect(within(outils).getByText(/Aucun accord commercial/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/partenaire/i);
    // Pas de logo : ce sont leurs marques.
    expect(within(outils).queryByRole('img')).not.toBeInTheDocument();
  });

  it('annonce les outils de base gratuits et les crédits du barème, en or, sans promettre un paiement', () => {
    afficher();

    const prix = section('Combien ça coûte ?');
    expect(within(prix).getByText("Pas d'abonnement : tu ne paies que les actions d'IGINI que tu lances.")).toBeInTheDocument();
    expect(within(prix).getByRole('heading', { level: 3, name: 'Les outils de base' })).toBeInTheDocument();
    expect(within(prix).getByText('Gratuit')).toHaveClass('accueil-prix');
    expect(within(prix).getByText('Projets sans limite')).toBeInTheDocument();
    expect(within(prix).getByRole('heading', { level: 3, name: "Les actions d'IGINI" })).toBeInTheDocument();
    expect(BAREME_PUBLIC.valeurCreditCentimes).toBe(10);
    expect(within(prix).getByText('1 crédit = 0,10 €')).toHaveClass('accueil-prix');
    expect(within(prix).getByText(`${BAREME_PUBLIC.bienvenue} crédits offerts à l'inscription`)).toBeInTheDocument();
    expect(
      within(prix).getByText(`Analyse d'une idée : ${BAREME_PUBLIC.exemples.analyser} crédits`),
    ).toBeInTheDocument();
    expect(within(prix).getByText('Message au chat : 1 crédit')).toBeInTheDocument();
    expect(
      within(prix).getByText('Recharges de 10 €, 20 € ou 50 € — paiement par carte bientôt disponible.'),
    ).toHaveClass('accueil-note');
    // Un prix n'est pas une action : aucun bouton dans cette section.
    expect(within(prix).queryByRole('button')).not.toBeInTheDocument();
    // Plus aucun abonnement nulle part.
    expect(document.body.textContent).not.toMatch(/€ \/ mois|par mois|Entrepreneur|Découverte|abonnement payant/);
    expect(document.body.textContent).not.toMatch(/sans engagement|carte bancaire/i);
  });

  it('cache les témoignages tant qu’aucun vrai témoignage n’existe', () => {
    afficher();

    expect(screen.queryByRole('heading', { name: 'Témoignages' })).not.toBeInTheDocument();
    expect(document.querySelector('blockquote')).toBeNull();
  });

  it('dit tout en transparence, et renvoie à la politique de confidentialité', () => {
    afficher();

    const transparence = section('Transparence');
    expect(within(transparence).getByText(/IGINI propose, tu décides/)).toBeInTheDocument();
    expect(within(transparence).getByText(/Union européenne \(Irlande\)/)).toBeInTheDocument();
    expect(within(transparence).getByText(/jamais revendues/)).toBeInTheDocument();
    expect(within(transparence).getByText(/images de ta pièce d'identité/)).toBeInTheDocument();
    expect(within(transparence).getByText(/Anthropic/)).toBeInTheDocument();
    expect(
      within(transparence).getByRole('link', { name: 'Lire la politique de confidentialité' }),
    ).toHaveAttribute('href', '/confidentialite');
  });

  it('replie une FAQ courte, puis mène à l’inscription', () => {
    afficher();

    const faq = section('Questions fréquentes');
    const questions = faq.querySelectorAll('details');
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(question).not.toHaveAttribute('open');
    }
    expect(within(faq).getByText(/Pas tels quels/)).not.toBeVisible();
    expect(within(faq).getByText('Est-ce gratuit ?')).toBeVisible();
    expect(within(faq).getByText('Ignitux remplace-t-il ma compta et ma banque ?')).toBeVisible();
    // La réponse sur le prix reprend les chiffres du barème, sans offre payante.
    expect(within(faq).getByText(/1 crédit = 0,10 €\) ; 30 crédits sont offerts/)).toBeInTheDocument();
    fireEvent.click(within(faq).getByText('Est-ce gratuit ?'));
    expect(faq.textContent).not.toMatch(/offre Entrepreneur|Découverte/);

    // L'appel final vient après la dernière question.
    const liens = screen.getAllByRole('link', { name: 'Créer mon compte gratuitement' });
    expect(liens).toHaveLength(2);
    const dernier = liens[liens.length - 1];
    expect(dernier).toHaveAttribute('href', '/signup');
    expect(faq.compareDocumentPosition(dernier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dernier).getByRole('button')).toHaveClass('primary');
    expect(screen.getByText(`${BAREME_PUBLIC.bienvenue} crédits offerts · sans abonnement`)).toBeInTheDocument();
  });

  it.each([
    [
      'en',
      'From idea to company.',
      'How much does it cost?',
      '1 credit = €0.10',
      'Free',
      'Common questions',
      'Top-ups of €10, €20 or €50 — card payment coming soon.',
      'Chat message: 1 credit',
    ],
    [
      'pt',
      'Da ideia à empresa.',
      'Quanto custa?',
      '1 crédito = 0,10 €',
      'Gratuito',
      'Perguntas frequentes',
      'Carregamentos de 10 €, 20 € ou 50 € — pagamento por cartão disponível em breve.',
      'Mensagem no chat: 1 crédito',
    ],
  ] as const)(
    'se lit aussi en %s, avec les mêmes prix',
    (code, promesse, combien, valeurCredit, gratuit, questions, recharges, message) => {
      langue.code = code;
      afficher();

      expect(screen.getByRole('heading', { level: 1, name: promesse })).toBeInTheDocument();
      const prix = section(combien);
      // Le montant vient du barème, la mise en forme de la langue.
      expect(within(prix).getByText(valeurCredit)).toHaveClass('accueil-prix');
      expect(within(prix).getByText(gratuit)).toHaveClass('accueil-prix');
      expect(within(prix).getByText(recharges)).toBeInTheDocument();
      expect(within(prix).getByText(message)).toBeInTheDocument();
      const faq = section(questions);
      for (const question of faq.querySelectorAll('details')) {
        expect(question).not.toHaveAttribute('open');
      }
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      // Aucune clé de traduction oubliée à l'écran.
      expect(document.body.textContent).not.toMatch(/accueil\.|\{n\}|\{valeur\}/);
    },
  );

  it('n’affiche aucune clé de traduction à la place d’un texte', () => {
    afficher();

    expect(document.body.textContent).not.toMatch(/accueil\.|\{n\}|\{valeur\}|\{nom\}/);
  });

  it('redirige vers /accueil si déjà connecté', async () => {
    signInAs('tok123', { id: 'u1', email: 'a@b.com' });

    afficher();

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/accueil'));
  });
});
