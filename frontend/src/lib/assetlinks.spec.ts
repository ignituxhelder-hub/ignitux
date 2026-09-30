import { describe, expect, it } from 'vitest';
import { declarationsAndroid } from './assetlinks';

const EMPREINTE = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');

describe('assetlinks.json', () => {
  it('ne déclare rien tant que la configuration manque', () => {
    expect(declarationsAndroid(undefined, undefined)).toEqual([]);
    expect(declarationsAndroid('app.ignitux.twa', '')).toEqual([]);
    expect(declarationsAndroid('', EMPREINTE)).toEqual([]);
  });

  it('déclare le paquet et ses empreintes, en majuscules', () => {
    const [declaration] = declarationsAndroid('app.ignitux.twa', ` ${EMPREINTE.toLowerCase()} `) as [
      { target: { package_name: string; sha256_cert_fingerprints: string[] } },
    ];
    expect(declaration.target.package_name).toBe('app.ignitux.twa');
    expect(declaration.target.sha256_cert_fingerprints).toEqual([EMPREINTE]);
  });

  // Une empreinte mal copiée ne doit pas partir telle quelle : Chrome la
  // refuserait sans rien dire, et l'application garderait sa barre d'adresse.
  it('écarte une empreinte mal formée et garde les bonnes', () => {
    const [declaration] = declarationsAndroid('app.ignitux.twa', `AB:CD,${EMPREINTE}`) as [
      { target: { sha256_cert_fingerprints: string[] } },
    ];
    expect(declaration.target.sha256_cert_fingerprints).toEqual([EMPREINTE]);
  });

  it('refuse un nom de paquet qui n’en est pas un', () => {
    expect(declarationsAndroid('ignitux', EMPREINTE)).toEqual([]);
    expect(declarationsAndroid('app.ignitux; rm', EMPREINTE)).toEqual([]);
  });
});
