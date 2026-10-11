import { describe, expect, it } from 'vitest';
import { lectureDeSection, ROLES_EQUIPE, ROLE_EQUIPE_LABEL } from './equipe';

describe('équipe côté interface', () => {
  it('propose les quatre rôles qu’on peut attribuer, dans cet ordre', () => {
    expect(ROLES_EQUIPE.map((r) => ROLE_EQUIPE_LABEL[r])).toEqual(['Associé', 'Salarié', 'Comptable', 'Observateur']);
  });

  it('demande le bon droit de lecture pour chaque section', () => {
    expect(lectureDeSection('analyse')).toBe('voir_projet');
    expect(lectureDeSection('construction')).toBe('voir_projet');
    expect(lectureDeSection('score')).toBe('voir_projet');
    expect(lectureDeSection('financement')).toBe('voir_plan_financement');
    expect(lectureDeSection('taches')).toBe('voir_taches');
    expect(lectureDeSection('processus')).toBe('voir_taches');
    expect(lectureDeSection('memoire')).toBe('voir_conformite_memoire');
    expect(lectureDeSection('conformite')).toBe('voir_conformite_memoire');
    expect(lectureDeSection('capital')).toBe('voir_financement');
    expect(lectureDeSection('infos')).toBe('modifier_projet');
    // L'équipe se voit par tout membre ; sa gestion reste au propriétaire.
    expect(lectureDeSection('collaborateurs')).toBeNull();
  });

  it('ne montre pas une section inconnue par défaut : elle exige de voir le projet', () => {
    expect(lectureDeSection('nouvelle-section')).toBe('voir_projet');
  });
});
