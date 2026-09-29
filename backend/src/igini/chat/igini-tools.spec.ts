import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  IGINI_TOOL_DEFINITIONS,
  PROJECT_ID_INPUT_SCHEMA,
  RAPPELER_SOUVENIRS_INPUT_SCHEMA,
  toToolErrorMessage,
} from './igini-tools.js';

describe('IGINI_TOOL_DEFINITIONS', () => {
  it('déclare exactement les 7 outils prévus', () => {
    expect(IGINI_TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(
      ['analyser', 'construire', 'developper', 'financer', 'lister_projets', 'rappeler_souvenirs', 'transmettre'].sort(),
    );
  });

  it('chaque outil a une description non vide', () => {
    for (const tool of IGINI_TOOL_DEFINITIONS) {
      expect(tool.description?.length).toBeGreaterThan(0);
    }
  });

  it('les 5 outils générateurs exigent project_id', () => {
    for (const nom of ['analyser', 'construire', 'financer', 'developper', 'transmettre']) {
      const tool = IGINI_TOOL_DEFINITIONS.find((t) => t.name === nom)!;
      expect(tool.input_schema.required).toContain('project_id');
    }
  });

  it("lister_projets n'exige aucune entrée", () => {
    const tool = IGINI_TOOL_DEFINITIONS.find((t) => t.name === 'lister_projets')!;
    expect(tool.input_schema.required ?? []).toEqual([]);
  });
});

describe('PROJECT_ID_INPUT_SCHEMA', () => {
  it('accepte un project_id', () => {
    expect(PROJECT_ID_INPUT_SCHEMA.parse({ project_id: 'p1' })).toEqual({ project_id: 'p1' });
  });

  it('rejette une entrée sans project_id', () => {
    expect(() => PROJECT_ID_INPUT_SCHEMA.parse({})).toThrow(z.ZodError);
  });
});

describe('RAPPELER_SOUVENIRS_INPUT_SCHEMA', () => {
  it('accepte une entrée vide (souvenirs personnels, toutes catégories)', () => {
    expect(RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({})).toEqual({});
  });

  it('accepte project_id et categorie', () => {
    expect(RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({ project_id: 'p1', categorie: 'decision' })).toEqual({
      project_id: 'p1',
      categorie: 'decision',
    });
  });

  it('rejette une categorie inconnue', () => {
    expect(() => RAPPELER_SOUVENIRS_INPUT_SCHEMA.parse({ categorie: 'invention' })).toThrow(z.ZodError);
  });
});

describe('toToolErrorMessage', () => {
  it('extrait le message texte d’une HttpException simple (assertWithinQuota)', () => {
    expect(toToolErrorMessage(new HttpException('Plafond atteint.', HttpStatus.PAYMENT_REQUIRED))).toBe(
      'Plafond atteint.',
    );
  });

  it('extrait le message texte d’une exception à corps objet (offres.exiger)', () => {
    expect(
      toToolErrorMessage(
        new ForbiddenException({ message: 'Ton offre n’inclut pas ce générateur.', offreQuiOuvre: 'entrepreneur' }),
      ),
    ).toBe('Ton offre n’inclut pas ce générateur.');
  });

  it('extrait le message d’une NotFoundException standard', () => {
    expect(toToolErrorMessage(new NotFoundException('Projet introuvable.'))).toBe('Projet introuvable.');
  });

  it('renvoie un message générique pour une entrée invalide (ZodError)', () => {
    const erreur = PROJECT_ID_INPUT_SCHEMA.safeParse({});
    expect(toToolErrorMessage(erreur.error)).toBe("L'entrée fournie à l'outil est invalide.");
  });

  it('retombe sur error.message pour une erreur générique', () => {
    expect(toToolErrorMessage(new Error('panne réseau'))).toBe('panne réseau');
  });
});
