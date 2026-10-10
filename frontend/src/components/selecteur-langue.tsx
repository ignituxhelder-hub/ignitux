'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, isLocale } from '@/i18n/config';

const UN_AN = 60 * 60 * 24 * 365;

/** Choix de la langue : mémorisé dans un cookie, puis la page est rechargée. */
export function SelecteurLangue() {
  const t = useTranslations('langue');
  const locale = useLocale();
  const router = useRouter();

  function choisir(value: string) {
    if (!isLocale(value)) return;
    document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=${UN_AN}; samesite=lax`;
    router.refresh();
  }

  return (
    <select
      className="selecteur-langue"
      aria-label={t('label')}
      value={locale}
      onChange={(e) => choisir(e.target.value)}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
