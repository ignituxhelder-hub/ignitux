/** Langues proposées. Le français reste la langue source et le repli. */
export const LOCALES = ['fr', 'en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Nom de chaque langue dans sa propre langue, pour le sélecteur. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  pt: 'Português',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Choisit une langue à partir de l'en-tête Accept-Language, pour la
 * première visite (avant tout cookie). `fr-CA,en;q=0.8` donne `fr`.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { base: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of candidates) {
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
