import { estOperateurIgnitux } from './operateurs.js';

describe('estOperateurIgnitux', () => {
  it('reconnaît un e-mail de la liste, sans tenir compte de la casse ni des espaces', () => {
    const env = { IGNITUX_OPERATEURS: ' Ops@Ignitux.test , autre@ignitux.test ' };
    expect(estOperateurIgnitux('ops@ignitux.test', env)).toBe(true);
    expect(estOperateurIgnitux('AUTRE@ignitux.test', env)).toBe(true);
  });

  it('refuse un e-mail absent de la liste', () => {
    expect(estOperateurIgnitux('porteur@x.test', { IGNITUX_OPERATEURS: 'ops@ignitux.test' })).toBe(
      false,
    );
  });

  it('ne reconnaît personne quand la liste est absente ou vide', () => {
    expect(estOperateurIgnitux('ops@ignitux.test', {})).toBe(false);
    expect(estOperateurIgnitux('ops@ignitux.test', { IGNITUX_OPERATEURS: '' })).toBe(false);
    expect(estOperateurIgnitux('ops@ignitux.test', { IGNITUX_OPERATEURS: ' , ' })).toBe(false);
  });

  it('ne reconnaît pas une adresse vide, même si la liste contient une entrée vide', () => {
    expect(estOperateurIgnitux('', { IGNITUX_OPERATEURS: ',ops@ignitux.test' })).toBe(false);
  });
});
