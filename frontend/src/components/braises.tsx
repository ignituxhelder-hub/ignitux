/**
 * LES BRAISES — quelques étincelles qui montent lentement derrière le site.
 *
 * C'est la matière des images de référence de la direction « Gravure » : une
 * nuit, une braise en bas, et des points de feu qui s'élèvent. Cinq suffisent ;
 * davantage, et l'œil les suit au lieu de lire.
 *
 * Purement décoratif : `aria-hidden`, aucun état, aucun JavaScript. Le
 * mouvement est en CSS (`transform` et `opacity`, que le navigateur anime sans
 * recalculer la page), et `globals.css` retire tout le calque quand la
 * personne a demandé moins d'animations.
 */

const BRAISES = [
  { gauche: 12, delai: 0 },
  { gauche: 31, delai: 3.1 },
  { gauche: 50, delai: 6.2 },
  { gauche: 68, delai: 1.6 },
  { gauche: 86, delai: 4.7 },
];

export function Braises() {
  return (
    <div className="braises" aria-hidden="true">
      {BRAISES.map(({ gauche, delai }) => (
        <span
          key={gauche}
          className="braise"
          style={{ left: `${gauche}%`, animationDelay: `${delai}s` }}
        />
      ))}
    </div>
  );
}
