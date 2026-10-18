import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFRES_PUBLIQUES, prixEnEuros } from './offres-publiques';

/**
 * La page d'accueil annonce des prix et des quotas à quelqu'un qui n'a pas
 * encore de compte. Ce qu'elle annonce doit être ce que le serveur applique :
 * on lit donc le catalogue lui-même, dans le dépôt, comme `cgu.spec.ts` lit la
 * version des CGU.
 */
const source = readFileSync(
  join(process.cwd(), '..', 'backend', 'src', 'offres', 'offres-catalogue.ts'),
  'utf8',
);

/** Le texte d'une entrée du tableau CATALOGUE, de son `id` à la suivante. */
function entree(id: string): string {
  const debutCatalogue = source.indexOf('export const CATALOGUE');
  const finCatalogue = source.indexOf('\n];', debutCatalogue);
  const catalogue = source.slice(debutCatalogue, finCatalogue);
  const debut = catalogue.indexOf(`id: '${id}'`);
  if (debut === -1) throw new Error(`Offre ${id} introuvable dans le catalogue du serveur`);
  const suivante = catalogue.indexOf("id: '", debut + 1);
  return catalogue.slice(debut, suivante === -1 ? undefined : suivante);
}

function valeur(texte: string, cle: string): string | undefined {
  return new RegExp(`\\b${cle}:\\s*([^,\\n]+),`).exec(texte)?.[1].trim();
}

function nombreOuNull(texte: string, cle: string): number | null {
  const brut = valeur(texte, cle);
  if (brut === undefined) throw new Error(`${cle} introuvable`);
  return brut === 'null' ? null : Number(brut);
}

describe('les offres annoncées sur la page d’accueil', () => {
  it('sont les deux offres du catalogue, ni plus ni moins', () => {
    expect(/export const OFFRES = \['decouverte', 'entrepreneur'\] as const;/.test(source)).toBe(
      true,
    );
    expect(Object.keys(OFFRES_PUBLIQUES)).toEqual(['decouverte', 'entrepreneur']);
  });

  it.each(Object.entries(OFFRES_PUBLIQUES))(
    '%s : même prix, mêmes projets, même quota que le serveur',
    (id, copie) => {
      const texte = entree(id);
      expect(nombreOuNull(texte, 'prixCentimes')).toBe(copie.prixCentimes);
      expect(nombreOuNull(texte, 'projets')).toBe(copie.projets);
      expect(nombreOuNull(texte, 'appelsIaParMois')).toBe(copie.appelsIaParMois);
    },
  );

  it('ce que la page écrit en toutes lettres reste vrai', () => {
    // « analyses IGINI » pour la gratuite : elle n'ouvre que l'analyse.
    const decouverte = entree('decouverte');
    expect(valeur(decouverte, 'generateurs')).toBe("['analyser']");
    expect(valeur(decouverte, 'outilsDeGestion')).toBe('false');
    expect(valeur(decouverte, 'collaborateurs')).toBe('0');

    // « Toutes les étapes d'IGINI », la gestion, le financement, l'équipe.
    const entrepreneur = entree('entrepreneur');
    expect(valeur(entrepreneur, 'generateurs')).toBe('[...GENERATEURS_METHODE]');
    expect(valeur(entrepreneur, 'outilsDeGestion')).toBe('true');
    expect(valeur(entrepreneur, 'investisseurs')).toBe('true');
    expect(valeur(entrepreneur, 'collaborateurs')).toBe('null');
    expect(valeur(entrepreneur, 'evaluationFinancement')).toBe('true');
  });
});

describe('prixEnEuros', () => {
  it('écrit un prix rond sans centimes, dans chaque langue', () => {
    expect(prixEnEuros(2000, 'fr')).toBe('20');
    expect(prixEnEuros(2000, 'en')).toBe('20');
    expect(prixEnEuros(2000, 'pt')).toBe('20');
  });

  it('garde les centimes quand il y en a, avec le séparateur de la langue', () => {
    expect(prixEnEuros(990, 'fr')).toBe('9,90');
    expect(prixEnEuros(990, 'en')).toBe('9.90');
  });
});
