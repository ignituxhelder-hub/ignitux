/**
 * LA BOUSSOLE ET LE FEU — la marque d'Ignitux.
 *
 * Les deux formes disent la même chose que la devise et la méthode :
 *
 *   — la boussole, c'est « la vérité avant tout » et « nous servir » :
 *     une direction, un Nord, quelque chose qui indique sans décider à ta
 *     place. C'est l'anneau gradué et les quatre points cardinaux ;
 *   — le feu, c'est l'Étincelle de l'article 3 : ce que chaque personne
 *     apporte et qu'Ignitux protège plutôt que de le remplacer.
 *
 * Le Nord de la boussole est la flamme elle-même. Ce n'est pas un ornement :
 * c'est la seule affirmation que la marque se permet — ce qui oriente, ici,
 * c'est l'Étincelle de la personne, pas l'outil.
 *
 * Aucun état, aucune donnée : un composant purement décoratif, masqué aux
 * lecteurs d'écran, dont le nom « Ignitux » à côté porte déjà le sens.
 */
export function IgnituxMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Le dégradé du feu : braise en bas, flamme au cœur, étincelle en
            haut. Le même que --grad-fire en CSS, pour que le logo et les
            boutons soient taillés dans la même matière. */}
        <linearGradient id="ignitux-flame" x1="32" y1="12" x2="32" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc46b" />
          <stop offset="0.45" stopColor="#ff7a2f" />
          <stop offset="1" stopColor="#d1330a" />
        </linearGradient>
        <linearGradient id="ignitux-core" x1="32" y1="28" x2="32" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff4d6" />
          <stop offset="1" stopColor="#ffb347" />
        </linearGradient>
      </defs>

      {/* L'anneau de la boussole et ses graduations. */}
      <circle cx="32" cy="32" r="29" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      <circle
        cx="32"
        cy="32"
        r="24.5"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1"
        strokeDasharray="0.75 4.25"
        strokeLinecap="round"
      />

      {/* Les points cardinaux. Le Nord est en flamme, les trois autres en
          acier : la boussole a une seule direction privilégiée. */}
      <path d="M32 0.5 34.6 3.1 32 5.7 29.4 3.1Z" fill="#ff7a2f" />
      <path d="M61.5 32 58.9 34.6 56.3 32 58.9 29.4Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M32 63.5 29.4 60.9 32 58.3 34.6 60.9Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M0.5 32 3.1 29.4 5.7 32 3.1 34.6Z" fill="currentColor" fillOpacity="0.45" />

      {/* La flamme — l'aiguille qui pointe le Nord. */}
      <path
        d="M32 12.5C38 20.5 43 26 43 34C43 41.7 38.1 48 32 48C25.9 48 21 41.7 21 34C21 28.5 24 24.5 27 20.3C27 26 29.5 28 31.5 26.5C33.5 25 33.5 19 32 12.5Z"
        fill="url(#ignitux-flame)"
      />
      {/* Le cœur clair : ce qu'on protège au centre. */}
      <path
        d="M32 29.5C35 33.2 36.4 35.8 36.4 38.3C36.4 41.2 34.4 43.4 32 43.4C29.6 43.4 27.6 41.2 27.6 38.3C27.6 35.8 29 33.2 32 29.5Z"
        fill="url(#ignitux-core)"
      />
    </svg>
  );
}

/**
 * Le bloc de marque : la boussole, puis le nom. Utilisé partout où « Ignitux »
 * s'affiche en tête de page, pour que la marque soit identique d'un écran à
 * l'autre au lieu d'être réécrite à la main à chaque fois.
 */
export function Brand({ size = 26 }: { size?: number }) {
  return (
    <span className="brand">
      <IgnituxMark size={size} className="brand-mark" />
      <span className="brand-word">Ignitux</span>
    </span>
  );
}
