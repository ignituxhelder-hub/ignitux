/**
 * LES ICÔNES DU SYSTÈME — une par application du Bureau, une par étape de
 * projet.
 *
 * Avant, chaque application se reconnaissait par deux lettres (`monogramme`
 * dans lib/systeme.ts : « FA » pour Facturation, « CO » pour Comptabilité…).
 * Lisible une fois qu'on sait déjà ce que chaque sigle veut dire, pas avant —
 * exactement l'inverse de ce qu'une icône doit faire. Celles-ci sont des
 * pictogrammes simples, dessinés à la main dans le même style que l'icône
 * « Bureau » déjà en place (traits pleins, `currentColor`, 16×16) : pas de
 * bibliothèque externe pour vingt-cinq petits dessins.
 *
 * Un id absent de la liste reçoit le glyphe générique plutôt que de casser —
 * même principe de repli que le reste du système (`applicationDe`, etc.).
 */

interface IconeSvgProps {
  className?: string;
}

function iconeDocument({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0H9l4 4v10.5A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13Z" opacity="0.25" />
      <path d="M9 0v3.5A1.5 1.5 0 0 0 10.5 5H13" />
      <rect x="5" y="7" width="6" height="1.3" rx="0.6" />
      <rect x="5" y="9.5" width="6" height="1.3" rx="0.6" />
      <rect x="5" y="12" width="4" height="1.3" rx="0.6" />
    </svg>
  );
}

function iconePersonnes({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="4.5" r="2.5" />
      <circle cx="11" cy="6" r="2" opacity="0.5" />
      <path d="M1 15c0-3 2-5 4.5-5s4.5 2 4.5 5Z" />
      <path d="M10.5 10.3c2 .3 3.5 2 3.5 4.7h-3.2c0-1.8-.5-3.3-1.5-4.4.4-.2.8-.3 1.2-.3Z" opacity="0.5" />
    </svg>
  );
}

function iconeFacture({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3 0h7l3 3v11.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1 14.5v-13A1.5 1.5 0 0 1 3 0Z" opacity="0.2" />
      <path d="M10 0v2a1 1 0 0 0 1 1h2" />
      <rect x="3.5" y="6" width="7" height="1.2" rx="0.6" />
      <rect x="3.5" y="8.3" width="7" height="1.2" rx="0.6" />
      <rect x="3.5" y="10.6" width="4" height="1.2" rx="0.6" />
      <circle cx="11" cy="12.7" r="2" opacity="0.6" />
    </svg>
  );
}

function iconeCalculette({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="0.5" width="12" height="15" rx="1.5" opacity="0.2" />
      <rect x="4" y="2.5" width="8" height="3" rx="0.6" />
      {[0, 1, 2].map((ligne) =>
        [0, 1, 2].map((colonne) => (
          <rect
            key={`${ligne}-${colonne}`}
            x={4 + colonne * 2.8}
            y={7.5 + ligne * 2.3}
            width="2"
            height="1.6"
            rx="0.5"
          />
        )),
      )}
    </svg>
  );
}

function iconeBanque({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0.5 15 4.5v1.3H1V4.5Z" />
      <rect x="1" y="6.3" width="14" height="1.3" opacity="0.5" />
      <rect x="2.3" y="8" width="1.6" height="5.3" />
      <rect x="7.2" y="8" width="1.6" height="5.3" />
      <rect x="12.1" y="8" width="1.6" height="5.3" />
      <rect x="0.5" y="13.8" width="15" height="1.5" rx="0.4" />
    </svg>
  );
}

function iconePortefeuille({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h8A1.5 1.5 0 0 1 12 3.5v1H1Z" opacity="0.4" />
      <rect x="1" y="4.5" width="14" height="10" rx="1.5" opacity="0.2" />
      <path d="M1 4.5h12.5A1.5 1.5 0 0 1 15 6v8.5H2.5A1.5 1.5 0 0 1 1 13Z" />
      <circle cx="11.5" cy="9.5" r="1.4" opacity="0.6" />
    </svg>
  );
}

function iconeCommunaute({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="4" r="2.2" />
      <circle cx="3" cy="7" r="1.8" opacity="0.5" />
      <circle cx="13" cy="7" r="1.8" opacity="0.5" />
      <path d="M8 7.5c-2.4 0-4.2 1.9-4.2 5h8.4c0-3.1-1.8-5-4.2-5Z" />
      <path d="M3 9c-1.7.3-2.6 1.8-2.6 4h3.1" opacity="0.5" />
      <path d="M13 9c1.7.3 2.6 1.8 2.6 4h-3.1" opacity="0.5" />
    </svg>
  );
}

function iconePoignee({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 5 4 2l2 2-3 3Z" opacity="0.6" />
      <path d="M15 5 12 2l-2 2 3 3Z" opacity="0.6" />
      <path d="M3 6.5 6 9.5a1.4 1.4 0 0 0 2 0l0.3-.3a1.4 1.4 0 0 1 2-0L12 11" />
      <path d="M12 6.5 9 9.5" opacity="0.6" />
      <path d="M1 7.5 6 12.5a2 2 0 0 0 2.8 0l4.7-4.7" opacity="0.3" />
    </svg>
  );
}

function iconePersonne({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="4.2" r="3" />
      <path d="M1.5 15c0-3.6 2.9-6.3 6.5-6.3s6.5 2.7 6.5 6.3Z" />
    </svg>
  );
}

function iconeEtiquette({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 1h6.5L15 8.5 8.5 15 1 7.5Z" opacity="0.25" />
      <path d="M1 1h6.5L15 8.5 8.5 15 1 7.5V1Z" />
      <circle cx="4.5" cy="4.5" r="1.4" fill="black" />
    </svg>
  );
}

function iconeEtincelle({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9 0 4 9h3.2L6 16l6-9.5H8.8Z" />
    </svg>
  );
}

function iconeConstitution({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 1.5A1.5 1.5 0 0 1 3.5 0H11l3 3v11.5A1.5 1.5 0 0 1 12.5 16h-9A1.5 1.5 0 0 1 2 14.5Z" opacity="0.2" />
      <path d="M11 0v2a1 1 0 0 0 1 1h2" />
      <rect x="4.5" y="6" width="7" height="1.2" rx="0.6" />
      <rect x="4.5" y="8.3" width="7" height="1.2" rx="0.6" />
      <rect x="4.5" y="10.6" width="5" height="1.2" rx="0.6" />
    </svg>
  );
}

function iconeReglages({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.6 0h2.8l.5 2.1c.5.2 1 .4 1.4.7l2-.8 2 3.4-1.7 1.3c0 .2.1.5.1.8s0 .5-.1.8l1.7 1.3-2 3.4-2-.8c-.4.3-.9.5-1.4.7L9.4 16H6.6l-.5-2.1a6 6 0 0 1-1.4-.7l-2 .8-2-3.4 1.7-1.3a5 5 0 0 1 0-1.6L.7 6.2l2-3.4 2 .8c.4-.3.9-.5 1.4-.7Z" opacity="0.3" />
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

function iconeBoite({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0 15 3.5v9L8 16 1 12.5v-9Z" opacity="0.2" />
      <path d="M1 3.5 8 7l7-3.5" />
      <path d="M8 7v9" opacity="0.6" />
    </svg>
  );
}

function iconeCaisse({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1" y="5.5" width="14" height="9" rx="1.2" opacity="0.2" />
      <path d="M2.5 5.5c0-2.5 2-4.5 5.5-4.5s5.5 2 5.5 4.5Z" />
      <circle cx="8" cy="10.5" r="2" />
      <rect x="0.5" y="13.3" width="15" height="1.6" rx="0.4" />
    </svg>
  );
}

function iconeAgenda({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="14" height="13" rx="1.5" opacity="0.2" />
      <rect x="1" y="2" width="14" height="3" rx="1.2" />
      <rect x="4" y="0" width="1.4" height="3.5" rx="0.6" />
      <rect x="10.6" y="0" width="1.4" height="3.5" rx="0.6" />
      <rect x="3.5" y="8" width="2.2" height="2.2" rx="0.4" />
      <rect x="6.9" y="8" width="2.2" height="2.2" rx="0.4" opacity="0.6" />
      <rect x="10.3" y="8" width="2.2" height="2.2" rx="0.4" opacity="0.6" />
    </svg>
  );
}

function iconeMaison({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0 15 6v9.5H1V6Z" opacity="0.2" />
      <path d="M0.5 7 8 0.5 15.5 7l-1 1.2L8 2.3 1.5 8.2Z" />
      <rect x="6.3" y="9" width="3.4" height="6.5" />
    </svg>
  );
}

function iconeVoiture({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2.5 9 3.8 4.8A1.5 1.5 0 0 1 5.2 3.7h5.6a1.5 1.5 0 0 1 1.4 1.1L13.5 9Z" opacity="0.3" />
      <rect x="1" y="9" width="14" height="4" rx="1.3" />
      <circle cx="4.2" cy="13.3" r="1.6" />
      <circle cx="11.8" cy="13.3" r="1.6" />
    </svg>
  );
}

function iconeMegaphone({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 6v4h2l5 3V3L3 6Z" />
      <path d="M8 3v10l4 2V1Z" opacity="0.4" />
      <rect x="1.5" y="10.5" width="2" height="3.5" rx="1" />
    </svg>
  );
}

function iconeLoupe({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="6.8" cy="6.8" r="5" opacity="0.25" />
      <path d="M6.8 2.3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0-1.8a6.3 6.3 0 1 1 0 12.6 6.3 6.3 0 0 1 0-12.6Z" />
      <rect x="10.6" y="11" width="2" height="6" rx="1" transform="rotate(-45 10.6 11)" />
    </svg>
  );
}

function iconeBalance({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="7.3" y="0" width="1.4" height="14" />
      <rect x="2" y="13.3" width="12" height="1.6" rx="0.5" />
      <path d="M8 2 2.5 4.5l2.7 5.5h-5.4Z" opacity="0.3" />
      <circle cx="2.5" cy="9.3" r="2.2" />
      <path d="M8 2 13.5 4.5l-2.7 5.5h5.4Z" opacity="0.3" />
      <circle cx="13.5" cy="9.3" r="2.2" />
    </svg>
  );
}

function iconeMarteau({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="6" width="2" height="10" rx="0.8" />
      <path d="M2.3 0.8 9.8 8.3 7.5 10.6 0 3.1Z" />
      <rect x="9" y="1.5" width="6" height="3" rx="0.8" transform="rotate(45 9 1.5)" opacity="0.5" />
    </svg>
  );
}

function iconePiece({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="7.3" opacity="0.2" />
      <path d="M8 0.7a7.3 7.3 0 1 0 0 14.6A7.3 7.3 0 0 0 8 0.7Zm0 1.8a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
      <path d="M8.8 4.3h-1v1a3 3 0 0 0-1.9 1 1.9 1.9 0 0 0 .6 2.9c.4.2.9.4 1.3.5v2a1.6 1.6 0 0 1-1-.6l-1 1a2.8 2.8 0 0 0 2 1v1h1v-1a3 3 0 0 0 2-1 2 2 0 0 0-.7-3c-.4-.2-.8-.3-1.3-.5v-1.8c.3.1.6.3.8.5l1-1a2.6 2.6 0 0 0-1.8-.9Z" />
    </svg>
  );
}

function iconeCroissance({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0.5 14.5h15" opacity="0.4" />
      <path d="M1 12 5.5 7l3 3L15 2" />
      <path d="M11 2h4v4" />
    </svg>
  );
}

function iconeTransmission({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="2.4" />
      <circle cx="13" cy="8" r="2.4" opacity="0.5" />
      <path d="M5.2 8h5.6" />
      <path d="M8.3 5.3 11 8l-2.7 2.7" />
    </svg>
  );
}

function iconeGenerique({ className }: IconeSvgProps) {
  return (
    <svg className={className} width="70%" height="70%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="7" opacity="0.3" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

/** Une icône par application du Bureau, et par étape de projet (etapes-projet.ts). */
const ICONES: Record<string, (props: IconeSvgProps) => ReturnType<typeof iconeGenerique>> = {
  // Applications du Bureau (lib/systeme.ts, APPS_SYSTEME).
  parcours: iconeDocument,
  relations: iconePersonnes,
  facturation: iconeFacture,
  comptabilite: iconeCalculette,
  banque: iconeBanque,
  portefeuille: iconePortefeuille,
  communaute: iconeCommunaute,
  reseau: iconePoignee,
  profil: iconePersonne,
  offres: iconeEtiquette,
  'consommation-ia': iconeEtincelle,
  constitution: iconeConstitution,
  compte: iconeReglages,
  stocks: iconeBoite,
  caisse: iconeCaisse,
  agenda: iconeAgenda,
  immobilier: iconeMaison,
  vehicules: iconeVoiture,
  publicite: iconeMegaphone,
  // Étapes de projet (lib/etapes-projet.ts, ETAPES_PROJET).
  analyse: iconeLoupe,
  'forme-juridique': iconeBalance,
  construction: iconeMarteau,
  financement: iconePiece,
  developpement: iconeCroissance,
  transmission: iconeTransmission,
};

export function Icone({ id, className }: { id: string; className?: string }) {
  const Dessin = ICONES[id] ?? iconeGenerique;
  return <Dessin className={className} />;
}
