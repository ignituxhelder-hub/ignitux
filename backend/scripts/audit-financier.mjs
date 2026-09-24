/**
 * L'AUDIT FINANCIER GLOBAL — le filet que personne ne tirait.
 *
 *   node scripts/audit-financier.mjs
 *   node scripts/audit-financier.mjs .env.production
 *
 * ── Pourquoi ce script existe ────────────────────────────────────────────
 *
 * `FinanceAuditService.globalAudit()` relit toute la base en SQL et cherche
 * six corruptions que les contrôles d'écriture ne peuvent pas attraper :
 * elles n'arrivent pas en écrivant, elles arrivent par une migration
 * bâclée, un script lancé à la main, une version antérieure du code ou un
 * import. Le fichier le dit lui-même, et il a raison.
 *
 * Il n'a délibérément **aucune route HTTP** : il parcourt les livres
 * d'Ignitux, les registres de tous les porteurs et les participations de
 * tous les investisseurs. L'exposer derrière une simple authentification
 * donnerait à n'importe quel compte une vue sur l'activité de tout le
 * monde. La décision est écrite en tête du service, et elle se termine par
 * « en attendant, il se lance depuis la console ».
 *
 * Or aucune commande ne le lançait. Un audit qu'on ne peut pas exécuter est
 * un audit qui n'existe pas — il rassure sans rien vérifier. Voici la
 * console.
 *
 * ── Ce qu'il fait, et ne fait pas ────────────────────────────────────────
 *
 * Il démarre le contexte Nest et appelle **le vrai service**, pas une copie
 * de ses requêtes : recopier le SQL ici le ferait diverger dès la première
 * correction apportée à l'un des deux. Il ne sert aucune route, n'écrit
 * rien, et ne montre que quelques identifiants par constat — jamais la
 * liste entière, qui serait précisément la fuite qu'on évite.
 */
import { config } from 'dotenv';

const drapeauEnv = process.argv.indexOf('--env');
const fichier =
  drapeauEnv >= 0 && process.argv[drapeauEnv + 1]
    ? process.argv[drapeauEnv + 1]
    : (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env');

config({ path: fichier, quiet: true });
if (!process.env.DATABASE_URL) {
  console.error(`Aucune DATABASE_URL dans ${fichier}.`);
  process.exit(1);
}

const adresse = new URL(process.env.DATABASE_URL);
console.log('┌─ Audit financier global ──────────────────────────────────');
console.log(`│ fichier : ${fichier}`);
console.log(`│ hôte    : ${adresse.hostname}`);
console.log(`│ base    : ${adresse.pathname.slice(1)}`);
console.log('│ mode    : lecture seule');
console.log('└───────────────────────────────────────────────────────────\n');

const { NestFactory } = await import('../dist/../node_modules/@nestjs/core/index.js').catch(
  async () => import('@nestjs/core'),
);
const { AppModule } = await import('../dist/app.module.js').catch(() => {
  console.error("Backend non compilé. Lancer d'abord : npm run build");
  process.exit(1);
});
const { FinanceAuditService } = await import('../dist/finance-audit/finance-audit.service.js');

// `logger: false` : le démarrage de Nest écrit une trentaine de lignes qui
// n'ont rien à voir avec l'audit et noieraient son verdict.
const contexte = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const audit = await contexte.get(FinanceAuditService).globalAudit();

  for (const constat of audit.findings) {
    const marque = constat.count === 0 ? '  ok  ' : '  !!  ';
    console.log(`${marque}${constat.code.padEnd(30)} ${String(constat.count).padStart(4)}`);
    console.log(`        ${constat.label}`);
    if (constat.count > 0) {
      // Le « pourquoi » ne s'affiche que quand il y a quelque chose : sur un
      // audit propre, six paragraphes d'explication cacheraient le verdict.
      console.log(`        → ${constat.why}`);
      console.log(`        exemples : ${constat.sample.join(', ')}`);
    }
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  const total = audit.findings.reduce((somme, c) => somme + c.count, 0);
  console.log(
    `║  ${audit.clean ? 'Aucune incohérence' : `${total} incohérence(s) sur ${audit.findings.filter((c) => c.count > 0).length} contrôle(s)`}`.padEnd(
      64,
    ) + '║',
  );
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\nRelu le ${new Date(audit.checkedAt).toISOString()}`);

  await contexte.close();
  process.exit(audit.clean ? 0 : 1);
} catch (erreur) {
  console.error('\nL’audit n’a pas pu aboutir :');
  console.error(String(erreur.message).slice(0, 300));
  await contexte.close();
  process.exit(1);
}
