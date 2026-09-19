import { config } from 'dotenv';

/**
 * PRÉPARATION DES TESTS DE BOUT EN BOUT.
 *
 * Ce fichier tourne avant tout import de code applicatif. Il fait deux
 * choses, et la seconde est la plus importante.
 *
 * 1. Il charge `.env.test`, qui pointe sur une base dédiée.
 *
 * 2. Il REFUSE de laisser la suite démarrer si la base visée n'est pas
 *    `ignitux_test`.
 *
 * Le second point n'est pas de la prudence décorative. Ces tests créent
 * des comptes, des projets, des contacts, puis les suppriment. Lancés par
 * accident sur la base de développement — parce que `.env.test` manque,
 * parce qu'une variable traîne dans l'environnement, parce que quelqu'un
 * a copié la mauvaise ligne — ils écriraient puis effaceraient des
 * données réelles. Sur la base des vraies personnes, ce serait pire
 * encore : ils y créeraient des comptes que personne n'a demandés.
 *
 * Une suite de tests qui peut détruire des données de production est un
 * danger, pas un filet. Celle-ci s'arrête net plutôt que de le risquer.
 */

config({ path: '.env.test', quiet: true });

const EXPECTED_DATABASE = 'ignitux_test';

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "Tests de bout en bout : DATABASE_URL est absente. Le fichier backend/.env.test " +
        "est-il présent ? Il n'est pas versionné — voir docs/decisions.md.",
    );
  }

  let database: string;
  try {
    database = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error("Tests de bout en bout : DATABASE_URL n'est pas une URL valide.");
  }

  if (database !== EXPECTED_DATABASE) {
    throw new Error(
      `Tests de bout en bout REFUSÉS : ils visent la base « ${database} » au lieu de ` +
        `« ${EXPECTED_DATABASE} ». Ces tests écrivent puis effacent des données — les laisser ` +
        'tourner ici détruirait du travail réel. Corrige backend/.env.test avant de relancer.',
    );
  }
}

assertTestDatabase();
