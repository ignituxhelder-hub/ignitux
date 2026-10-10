import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import pt from '../../messages/pt.json';
import { DEFAULT_LOCALE, localeFromAcceptLanguage } from './config';

type Tree = { [key: string]: string | Tree };

function cles(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : cles(v, `${prefix}${k}.`),
  );
}

describe('messages', () => {
  it.each([
    ['en', en],
    ['pt', pt],
  ])('%s a exactement les mêmes clés que le français', (_nom, messages) => {
    expect(cles(messages as Tree).sort()).toEqual(cles(fr as Tree).sort());
  });

  it.each([
    ['en', en],
    ['pt', pt],
  ])('%s ne laisse aucun texte vide', (_nom, messages) => {
    const vides = cles(messages as Tree).filter((k) => {
      let node: string | Tree = messages as Tree;
      for (const part of k.split('.')) node = (node as Tree)[part];
      return (node as string).trim() === '';
    });
    expect(vides).toEqual([]);
  });
});

describe('localeFromAcceptLanguage', () => {
  it('prend la langue préférée parmi celles proposées', () => {
    expect(localeFromAcceptLanguage('pt-PT,pt;q=0.9,en;q=0.8')).toBe('pt');
    expect(localeFromAcceptLanguage('de,en;q=0.7')).toBe('en');
  });

  it('respecte les poids q', () => {
    expect(localeFromAcceptLanguage('en;q=0.4,fr;q=0.9')).toBe('fr');
  });

  it('retombe sur le français sans en-tête ou avec une langue inconnue', () => {
    expect(localeFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage('ja,zh;q=0.8')).toBe(DEFAULT_LOCALE);
  });
});
