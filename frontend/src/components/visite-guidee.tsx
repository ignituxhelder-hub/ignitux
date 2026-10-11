'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * LA VISITE GUIDÉE.
 *
 * L'écran s'assombrit, sauf la zone présentée ; une bulle dit à quoi elle
 * sert. Pensée pour quelqu'un qui découvre Ignitux et ne sait pas encore où
 * regarder — pas pour tout expliquer : cinq arrêts au plus, et on peut la
 * passer à tout moment.
 *
 * Générique : elle reçoit des arrêts qui visent des éléments marqués
 * `data-visite="<cible>"`. Un arrêt dont l'élément n'est pas à l'écran est
 * sauté plutôt que de pointer dans le vide.
 */
export interface ArretVisite {
  /** Valeur de l'attribut `data-visite` de l'élément présenté. */
  cible: string;
  titre: string;
  texte: string;
}

export const CLE_VISITE_PROJET = 'ignitux.visite-projet';

/**
 * true aussi quand le stockage est illisible (navigation privée) : une
 * visite qui se relancerait à chaque ouverture deviendrait un obstacle. Le
 * bouton « ? Visite » reste là pour qui la veut.
 */
export function visiteDejaVue(): boolean {
  try {
    return window.localStorage.getItem(CLE_VISITE_PROJET) !== null;
  } catch {
    return true;
  }
}

export function marquerVisiteVue(): void {
  try {
    window.localStorage.setItem(CLE_VISITE_PROJET, new Date().toISOString());
  } catch {
    // Sans mémoire, la visite ne se relance pas d'elle-même : voir visiteDejaVue.
  }
}

const MARGE = 8;

interface Cadre {
  top: number;
  left: number;
  width: number;
  height: number;
}

function elementDe(arret: ArretVisite): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-visite="${arret.cible}"]`);
}

export function VisiteGuidee({
  arrets,
  ouverte,
  onFermer,
}: {
  arrets: readonly ArretVisite[];
  ouverte: boolean;
  onFermer: () => void;
}) {
  const titreId = useId();
  const bulle = useRef<HTMLDivElement>(null);
  const [presents, setPresents] = useState<ArretVisite[] | null>(null);
  const [index, setIndex] = useState(0);
  const [cadre, setCadre] = useState<Cadre | null>(null);

  // Tenu à part : une page qui repasse une nouvelle fonction à chaque
  // affichage ne doit pas renvoyer la visite au premier arrêt.
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  // Les arrêts se choisissent à l'ouverture : ce qui est à l'écran à ce
  // moment-là, pas ce qui le sera peut-être plus tard.
  useEffect(() => {
    if (!ouverte) {
      setPresents(null);
      return;
    }
    const trouves = arrets.filter((arret) => elementDe(arret) !== null);
    if (trouves.length === 0) {
      fermer.current();
      return;
    }
    setIndex(0);
    setPresents(trouves);
  }, [ouverte, arrets]);

  const arret = presents?.[index] ?? null;

  // La découpe suit l'élément : au changement d'arrêt, au défilement et au
  // redimensionnement (un téléphone qu'on tourne).
  useLayoutEffect(() => {
    if (!arret) return;
    const element = elementDe(arret);
    if (!element) return;
    const sansAnimation =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView?.({ behavior: sansAnimation ? 'auto' : 'smooth', block: 'center' });
    const mesurer = () => {
      const r = element.getBoundingClientRect();
      setCadre({
        top: r.top - MARGE,
        left: r.left - MARGE,
        width: r.width + MARGE * 2,
        height: r.height + MARGE * 2,
      });
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    window.addEventListener('scroll', mesurer, true);
    return () => {
      window.removeEventListener('resize', mesurer);
      window.removeEventListener('scroll', mesurer, true);
    };
  }, [arret]);

  useEffect(() => {
    if (arret) bulle.current?.focus();
  }, [arret]);

  if (!ouverte || !presents || !arret) return null;

  const dernier = index === presents.length - 1;
  const suivant = () => (dernier ? onFermer() : setIndex((i) => i + 1));
  const precedent = () => setIndex((i) => Math.max(0, i - 1));

  function clavier(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onFermer();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!dernier) setIndex((i) => i + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      precedent();
    } else if (event.key === 'Tab') {
      // Le focus reste dans la bulle tant qu'elle est ouverte.
      const focusables = bulle.current?.querySelectorAll<HTMLElement>('button');
      if (!focusables || focusables.length === 0) return;
      const premier = focusables[0];
      const ultime = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === premier || document.activeElement === bulle.current)) {
        event.preventDefault();
        ultime.focus();
      } else if (!event.shiftKey && document.activeElement === ultime) {
        event.preventDefault();
        premier.focus();
      }
    }
  }

  // La bulle sous la zone, ou au-dessus si elle sortirait de l'écran.
  const hauteurEcran = typeof window === 'undefined' ? 0 : window.innerHeight;
  const enDessous = !cadre || cadre.top + cadre.height + 220 < hauteurEcran;
  const positionBulle = cadre
    ? enDessous
      ? { top: cadre.top + cadre.height + 12 }
      : { bottom: hauteurEcran - cadre.top + 12 }
    : { top: 16 };

  return (
    <div className="visite" role="presentation">
      <div className="visite__voile" onClick={onFermer} aria-hidden="true" />
      {cadre && (
        <div
          className="visite__trou"
          aria-hidden="true"
          style={{ top: cadre.top, left: cadre.left, width: cadre.width, height: cadre.height }}
        />
      )}
      <div
        ref={bulle}
        className="visite__bulle"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        onKeyDown={clavier}
        style={positionBulle}
      >
        <p className="visite__compteur">
          {index + 1}/{presents.length}
        </p>
        <h2 id={titreId} className="visite__titre">
          {arret.titre}
        </h2>
        <p className="visite__texte">{arret.texte}</p>
        <div className="visite__actions">
          <button type="button" className="visite__passer" onClick={onFermer}>
            Passer la visite
          </button>
          <span className="visite__navigation">
            {index > 0 && (
              <button type="button" className="secondary" onClick={precedent}>
                Précédent
              </button>
            )}
            <button type="button" className="primary" onClick={suivant}>
              {dernier ? 'Terminer' : 'Suivant'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
