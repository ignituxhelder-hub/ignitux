import { buildProjectPrompt } from './build-project-prompt.js';

describe('buildProjectPrompt', () => {
  it('inclut le titre et la description', () => {
    const result = buildProjectPrompt('Mon idée', 'Une description');

    expect(result).toContain('Titre : Mon idée');
    expect(result).toContain('Description : Une description');
  });

  it("affiche un texte de repli quand la description est absente", () => {
    const result = buildProjectPrompt('Mon idée', null);

    expect(result).toContain('Description : (aucune description fournie)');
  });

  it("n'ajoute aucune section de contexte quand il n'y en a pas", () => {
    const result = buildProjectPrompt('Mon idée', 'Une description');

    expect(result).not.toContain('IGINI sait déjà');
  });

  it('ajoute le contexte fourni par les étapes précédentes quand il existe', () => {
    const result = buildProjectPrompt('Mon idée', 'Une description', 'Analyse : idée prometteuse.');

    expect(result).toContain("Ce qu'IGINI sait déjà :");
    expect(result).toContain('Analyse : idée prometteuse.');
  });
});
