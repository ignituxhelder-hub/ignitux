import type { RapportEvaluation } from '@/lib/api';

/**
 * Les sections en liste du rapport, éditées en texte : une ligne par élément,
 * les champs séparés par « | ». Plus lisible pour un humain qu'un formulaire
 * par élément, et sans JSON à manipuler.
 */
export type SectionListe = 'risques' | 'dossier' | 'pistes' | 'prochainesEtapes' | 'manques' | 'connu';

type Resultat<T> = { valeur: T } | { erreur: string };

const GRAVITES = ['faible', 'moyenne', 'forte'] as const;
const ETATS: Record<string, 'prete' | 'manquante'> = {
  prete: 'prete',
  'prête': 'prete',
  manquante: 'manquante',
};

function lignes(texte: string): string[] {
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function champs(ligne: string): string[] {
  return ligne.split('|').map((c) => c.trim());
}

export function listeEnTexte(section: SectionListe, valeur: unknown): string {
  switch (section) {
    case 'risques':
      return (valeur as RapportEvaluation['risques']).map((r) => `${r.risque} | ${r.gravite} | ${r.reduction}`).join('\n');
    case 'dossier':
      return (valeur as RapportEvaluation['dossier'])
        .map((p) => `${p.piece} | ${p.etat === 'prete' ? 'prête' : 'manquante'}`)
        .join('\n');
    case 'pistes':
      return (valeur as RapportEvaluation['pistes']).map((p) => `${p.type} | ${p.pourquoi}`).join('\n');
    default:
      return (valeur as string[]).join('\n');
  }
}

export function texteEnListe(section: SectionListe, texte: string): Resultat<unknown[]> {
  const ls = lignes(texte);
  switch (section) {
    case 'risques': {
      const valeur = [];
      for (const [i, l] of ls.entries()) {
        const [risque, gravite, reduction] = champs(l);
        if (!risque || !reduction || !(GRAVITES as readonly string[]).includes(gravite)) {
          return { erreur: `Risques, ligne ${i + 1} : écris « risque | faible, moyenne ou forte | comment le réduire ».` };
        }
        valeur.push({ risque, gravite, reduction });
      }
      return { valeur };
    }
    case 'dossier': {
      const valeur = [];
      for (const [i, l] of ls.entries()) {
        const [piece, etat] = champs(l);
        const normalise = ETATS[(etat ?? '').toLowerCase()];
        if (!piece || !normalise) {
          return { erreur: `Dossier, ligne ${i + 1} : écris « pièce | prête ou manquante ».` };
        }
        valeur.push({ piece, etat: normalise });
      }
      return { valeur };
    }
    case 'pistes': {
      const valeur = [];
      for (const [i, l] of ls.entries()) {
        const [type, pourquoi] = champs(l);
        if (!type || !pourquoi) {
          return { erreur: `Pistes, ligne ${i + 1} : écris « type de financement | pourquoi ».` };
        }
        valeur.push({ type, pourquoi });
      }
      return { valeur };
    }
    default:
      return { valeur: ls };
  }
}
