/**
 * Traversée du graphe de concepts — algorithmes purs, sans accès base.
 *
 * Les liens sont créés avec un sens (from → to), mais la traversée les
 * considère comme bidirectionnels. C'est un choix : « le local dépend du
 * budget » relie les deux concepts dans l'esprit de la personne, quel que
 * soit le sens où elle l'a saisi, et un voisinage qui ignorerait la moitié
 * des liens donnerait une image fausse de ce qu'elle a construit. Le sens
 * reste conservé dans les données et affiché tel quel.
 */

export interface GraphEdge {
  from_concept_id: string;
  to_concept_id: string;
}

/**
 * Profondeur maximale acceptée. Au-delà de 3 sauts, le « voisinage » d'un
 * concept est en pratique le graphe entier : on n'y voit plus rien, et le
 * coût de calcul grimpe pour une information que personne ne lit.
 */
export const MAX_TRAVERSAL_DEPTH = 3;

function buildAdjacency(edges: readonly GraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    const neighbours = adjacency.get(a) ?? new Set<string>();
    neighbours.add(b);
    adjacency.set(a, neighbours);
  };

  for (const edge of edges) {
    connect(edge.from_concept_id, edge.to_concept_id);
    connect(edge.to_concept_id, edge.from_concept_id);
  }
  return adjacency;
}

/**
 * Identifiants des concepts atteignables depuis `startId` en au plus
 * `depth` sauts, `startId` inclus. Parcours en largeur : chaque concept est
 * visité une fois, à sa distance minimale.
 */
export function collectNeighbourhood(
  startId: string,
  edges: readonly GraphEdge[],
  depth: number,
): Set<string> {
  const limit = Math.max(0, Math.min(depth, MAX_TRAVERSAL_DEPTH));
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let step = 0; step < limit; step += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return visited;
}

/**
 * Le plus court chemin entre deux concepts, ou null s'ils ne sont pas
 * reliés. Renvoyer un chemin approximatif serait pire que rien : la
 * personne en déduirait un lien de pensée qu'elle n'a jamais posé.
 */
export function findShortestPath(
  fromId: string,
  toId: string,
  edges: readonly GraphEdge[],
): string[] | null {
  if (fromId === toId) return [fromId];

  const adjacency = buildAdjacency(edges);
  const previous = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      previous.set(neighbour, current);

      if (neighbour === toId) {
        const path = [toId];
        let cursor = toId;
        while (previous.has(cursor)) {
          cursor = previous.get(cursor) as string;
          path.unshift(cursor);
        }
        return path;
      }
      queue.push(neighbour);
    }
  }

  return null;
}

/**
 * Concepts qu'aucun lien ne relie à quoi que ce soit. Information utile en
 * tant que telle : un concept isolé n'est pas une erreur, c'est souvent une
 * idée qu'on n'a pas encore reliée au reste.
 */
export function findIsolated(
  conceptIds: readonly string[],
  edges: readonly GraphEdge[],
): string[] {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from_concept_id);
    connected.add(edge.to_concept_id);
  }
  return conceptIds.filter((id) => !connected.has(id));
}
