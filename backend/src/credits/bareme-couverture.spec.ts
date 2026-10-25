import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAREME } from './bareme.js';

/**
 * CHAQUE APPEL IA A UN PRIX — y compris ceux qu'un type n'attraperait pas.
 *
 * `BAREME` est indexé par `GeneratorName`, et `ClaudeService` exige un
 * `usage.generator` de ce type : en principe le compilateur suffit. Ce test
 * ferme la porte qu'il laisse ouverte — un `as GeneratorName`, une chaîne
 * construite, un appel écrit hors du type — en lisant le code lui-même :
 * tout `generator: '…'` écrit dans `src/` doit avoir sa ligne au barème.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === 'generated' ? [] : fichiers(chemin);
    return entree.name.endsWith('.ts') && !entree.name.endsWith('.spec.ts') ? [chemin] : [];
  });
}

function generateursEcrits(): Array<{ nom: string; fichier: string }> {
  const trouves: Array<{ nom: string; fichier: string }> = [];
  for (const fichier of fichiers(SRC)) {
    const texte = readFileSync(fichier, 'utf8');
    for (const [, nom] of texte.matchAll(/\bgenerator:\s*'([^']+)'/g)) {
      trouves.push({ nom, fichier: relative(SRC, fichier).split(sep).join('/') });
    }
  }
  return trouves;
}

describe('Couverture du barème : tout appel IA écrit dans le code a un prix', () => {
  const trouves = generateursEcrits();

  it('trouve bien les appels (le parcours ne passe pas à côté)', () => {
    const fichiersTrouves = new Set(trouves.map((t) => t.fichier));
    // Les points d'appel connus : les six générateurs, le chat, l'exécution,
    // l'évaluation, le questionnaire, les statuts.
    for (const attendu of [
      'igini/analysis/analysis.service.ts',
      'igini/chat/chat.service.ts',
      'igini/execution/execution.service.ts',
      'evaluation-financement/evaluation.service.ts',
      'statuts/statuts.service.ts',
    ]) {
      expect(fichiersTrouves).toContain(attendu);
    }
    expect(trouves.length).toBeGreaterThanOrEqual(12);
  });

  it('chaque `generator` écrit a sa ligne au barème', () => {
    const sansPrix = trouves.filter((t) => !(t.nom in BAREME)).map((t) => `${t.nom} (${t.fichier})`);
    expect(sansPrix).toEqual([]);
  });
});
