/**
 * L'affichage de l'argent et des parts, au même endroit pour toute
 * l'application.
 *
 * Trois écrans montraient des euros avec trois mises en forme légèrement
 * différentes — espace des milliers ici, pas là. Un montant qui change
 * d'allure d'une page à l'autre fait douter du montant lui-même.
 */

/**
 * Centimes entiers → euros lisibles, sans jamais passer par un flottant
 * intermédiaire. `12345` donne « 123,45 € », `500000` donne « 5 000,00 € ».
 */
export function euros(cents: number): string {
  const signe = cents < 0 ? '-' : '';
  const absolu = Math.abs(cents);
  const entiers = String(Math.floor(absolu / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${entiers},${String(absolu % 100).padStart(2, '0')} €`;
}

/**
 * Points de base → pourcentage. 1000 = « 10 % », 550 = « 5,5 % ».
 *
 * Les zéros de fin sont retirés : afficher « 10,00 % » laisse croire à une
 * précision au centième que la saisie n'avait pas forcément.
 */
export function pourcentage(basisPoints: number): string {
  const brut = (basisPoints / 100).toFixed(2);
  return `${brut.replace(/\.?0+$/, '').replace('.', ',')} %`;
}

/** Une date ISO en jour lisible. Rend « — » plutôt que « Invalid Date ». */
export function jour(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

/** Une date ISO en jour et heure. */
export function jourEtHeure(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR');
}

/** Saisie en euros (« 1234,50 ») → centimes entiers. null si illisible. */
export function centimesDepuisEuros(saisie: string): number | null {
  const nombre = Number(saisie.replace(/\s| | /g, '').replace(',', '.'));
  if (!Number.isFinite(nombre)) return null;
  return Math.round(nombre * 100);
}

/**
 * Saisie en pourcentage (« 12,5 », « 36 % ») → points de base entiers.
 * null si illisible, vide, négative, au-delà de 100 % ou avec plus de deux
 * décimales (un point de base est le plus petit pas représentable).
 *
 * Passe par le texte et non par `Number(x) * 100` : 0,29 * 100 vaut
 * 28,999999999999996 en virgule flottante.
 */
export function pointsDeBaseDepuisPourcentage(saisie: string): number | null {
  const propre = saisie.replace(/[\s%]/g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(propre);
  if (!m) return null;
  const points = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return points > 10000 ? null : points;
}
