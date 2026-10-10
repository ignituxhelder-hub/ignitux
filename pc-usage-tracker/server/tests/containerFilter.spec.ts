import { matchesFilter, selectMatchingNames } from '../src/docker/containerFilter';

describe('matchesFilter', () => {
  it('matche les noms de conteneurs contenant le filtre, sans distinction de casse', () => {
    expect(matchesFilter('/ignitux-backend-1', 'ignitux')).toBe(true);
    expect(matchesFilter('IGNITUX-frontend-1', 'ignitux')).toBe(true);
  });

  it('rejette les conteneurs qui ne correspondent pas au filtre', () => {
    expect(matchesFilter('/postgres-autre-projet', 'ignitux')).toBe(false);
  });

  it('ne matche jamais rien quand le filtre est vide', () => {
    expect(matchesFilter('/ignitux-backend-1', '')).toBe(false);
    expect(matchesFilter('/ignitux-backend-1', '   ')).toBe(false);
  });
});

describe('selectMatchingNames', () => {
  it('ne garde que les noms qui correspondent au filtre', () => {
    const names = ['/ignitux-backend-1', '/ignitux-frontend-1', '/autre-base-1'];
    expect(selectMatchingNames(names, 'ignitux')).toEqual(['/ignitux-backend-1', '/ignitux-frontend-1']);
  });

  it('renvoie un tableau vide quand rien ne correspond', () => {
    expect(selectMatchingNames(['/autre-base-1'], 'ignitux')).toEqual([]);
  });
});
