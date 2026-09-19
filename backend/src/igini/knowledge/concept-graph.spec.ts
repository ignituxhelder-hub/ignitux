import {
  collectNeighbourhood,
  findIsolated,
  findShortestPath,
  MAX_TRAVERSAL_DEPTH,
  type GraphEdge,
} from './concept-graph.js';

function edge(from: string, to: string): GraphEdge {
  return { from_concept_id: from, to_concept_id: to };
}

// a — b — c — d,  e isolé
const CHAIN: GraphEdge[] = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];

describe('collectNeighbourhood', () => {
  it('inclut toujours le concept de départ', () => {
    expect([...collectNeighbourhood('a', [], 2)]).toEqual(['a']);
  });

  it('remonte les liens dans les deux sens', () => {
    // Le lien a→b relie les deux concepts dans l'esprit de la personne,
    // quel que soit le sens où elle l'a saisi.
    expect([...collectNeighbourhood('b', [edge('a', 'b')], 1)].sort()).toEqual(['a', 'b']);
  });

  it("s'arrête à la profondeur demandée", () => {
    expect([...collectNeighbourhood('a', CHAIN, 1)].sort()).toEqual(['a', 'b']);
    expect([...collectNeighbourhood('a', CHAIN, 2)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('plafonne la profondeur pour ne pas rendre le graphe entier illisible', () => {
    const long: GraphEdge[] = [
      edge('n0', 'n1'),
      edge('n1', 'n2'),
      edge('n2', 'n3'),
      edge('n3', 'n4'),
      edge('n4', 'n5'),
    ];

    const reached = collectNeighbourhood('n0', long, 99);

    expect(reached.size).toBe(MAX_TRAVERSAL_DEPTH + 1);
    expect(reached.has('n5')).toBe(false);
  });

  it('traite une profondeur négative comme zéro', () => {
    expect([...collectNeighbourhood('a', CHAIN, -3)]).toEqual(['a']);
  });

  it('ne boucle pas sur un cycle', () => {
    const cycle: GraphEdge[] = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];

    expect([...collectNeighbourhood('a', cycle, 3)].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('findShortestPath', () => {
  it('renvoie le concept seul quand départ et arrivée sont identiques', () => {
    expect(findShortestPath('a', 'a', CHAIN)).toEqual(['a']);
  });

  it('trouve le chemin le long d\'une chaîne', () => {
    expect(findShortestPath('a', 'd', CHAIN)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('préfère le chemin le plus court quand il y en a plusieurs', () => {
    const edges = [...CHAIN, edge('a', 'd')];

    expect(findShortestPath('a', 'd', edges)).toEqual(['a', 'd']);
  });

  it("renvoie null quand aucun lien ne relie les deux concepts", () => {
    // Fabriquer un chemin approximatif ferait croire à la personne qu'elle
    // a posé un lien de pensée qu'elle n'a jamais posé.
    expect(findShortestPath('a', 'e', CHAIN)).toBeNull();
  });

  it('renvoie null sur un graphe sans aucune arête', () => {
    expect(findShortestPath('a', 'b', [])).toBeNull();
  });
});

describe('findIsolated', () => {
  it('liste les concepts qu\'aucun lien ne touche', () => {
    expect(findIsolated(['a', 'b', 'c', 'd', 'e'], CHAIN)).toEqual(['e']);
  });

  it('considère tous les concepts comme isolés sans aucune arête', () => {
    expect(findIsolated(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('renvoie une liste vide quand tout est relié', () => {
    expect(findIsolated(['a', 'b'], [edge('a', 'b')])).toEqual([]);
  });
});
