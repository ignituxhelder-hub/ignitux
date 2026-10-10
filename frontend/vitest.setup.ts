import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import fr from './messages/fr.json';

// Les composants appellent `useTranslations` sans fournisseur dans les
// tests. On lui donne les vrais textes français : les tests existants
// continuent de chercher « Se connecter » et le trouvent, sans que chacun
// ait à monter un fournisseur.
vi.mock('next-intl', () => {
  type Tree = { [key: string]: string | Tree };
  const lookup = (path: string): string => {
    let node: string | Tree = fr as Tree;
    for (const part of path.split('.')) {
      if (typeof node === 'string' || !(part in node)) return path;
      node = node[part];
    }
    return typeof node === 'string' ? node : path;
  };
  return {
    useLocale: () => 'fr',
    useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const text = lookup(namespace ? `${namespace}.${key}` : key);
      return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
    },
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});
