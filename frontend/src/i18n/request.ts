import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from './config';

/**
 * Langue de la requête : le cookie du sélecteur d'abord, puis la langue du
 * navigateur, puis le français. Pas de préfixe dans l'URL — les routes de
 * l'application (et son service worker) restent exactement les mêmes.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie)
    ? fromCookie
    : localeFromAcceptLanguage((await headers()).get('accept-language'));

  // Le français sert de base : une clé pas encore traduite s'affiche en
  // français plutôt que de laisser un identifiant brut à l'écran.
  const fr = (await import('../../messages/fr.json')).default as Tree;
  const messages =
    locale === DEFAULT_LOCALE
      ? fr
      : deepMerge(fr, (await import(`../../messages/${locale}.json`)).default as Tree);

  return { locale, messages };
});

type Tree = { [key: string]: string | Tree };

function deepMerge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    out[key] =
      typeof value === 'object' && typeof current === 'object' ? deepMerge(current, value) : value;
  }
  return out;
}
