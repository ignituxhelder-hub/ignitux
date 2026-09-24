/**
 * UN LIEN DE RÉINITIALISATION, À LA MAIN — tant qu'aucun email ne part.
 *
 *   node scripts/lien-mot-de-passe.mjs quelquun@exemple.fr
 *   node scripts/lien-mot-de-passe.mjs quelquun@exemple.fr .env.production
 *
 * ── Le problème que ça résout ────────────────────────────────────────────
 *
 * `MAIL_TRANSPORT=log` : aucun email ne part. Le mécanisme de
 * réinitialisation est pourtant intact — jeton de 64 caractères, valable
 * une heure, à usage unique, refusé s'il est rejoué. Seul le facteur
 * manque.
 *
 * Conséquence pour une bêta : **la première personne qui oublie son mot de
 * passe est enfermée dehors.** Pas parce que le produit est cassé, mais
 * parce que le lien part dans un journal que personne ne lit.
 *
 * Cette commande est le facteur. Elle fabrique un lien valide et l'affiche,
 * pour qu'on le transmette par le moyen dont on dispose. Ce n'est pas une
 * solution à l'échelle — c'est ce qu'il faut pour que trente bêta-testeurs
 * ne soient jamais bloqués en attendant un fournisseur d'email.
 *
 * ── Ce qu'elle ne contourne pas ──────────────────────────────────────────
 *
 * Elle appelle `PasswordResetService.createResetLink()`, c'est-à-dire le
 * code que l'API emploie elle-même : même durée, même forme d'adresse, même
 * usage unique, et **seul le hash du jeton est stocké**. Un lien déjà envoyé
 * reste donc irrécupérable, et c'est voulu : on en émet un nouveau, on ne
 * déterre pas l'ancien.
 *
 * ── Ce qu'elle dit et que l'API tait ────────────────────────────────────
 *
 * Sur un email inconnu, la route publique répond comme sur un email connu :
 * elle refuse de devenir un annuaire. Ici, c'est l'inverse qu'il faut — une
 * console d'exploitation qui se tairait laisserait chercher un lien qui
 * n'arrivera jamais. La différence est sans conséquence : pour lire cette
 * sortie, il faut déjà pouvoir lancer des commandes sur le serveur.
 */
import { config } from 'dotenv';

const arguments_ = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const email = arguments_[0];
const fichier = arguments_[1] ?? '.env';

if (!email || !email.includes('@')) {
  console.error('Usage : node scripts/lien-mot-de-passe.mjs <email> [fichier .env]');
  console.error('\nFabrique un lien de réinitialisation valable une heure, et l’affiche.');
  process.exit(1);
}

config({ path: fichier, quiet: true });
if (!process.env.DATABASE_URL) {
  console.error(`Aucune DATABASE_URL dans ${fichier}.`);
  process.exit(1);
}

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js').catch(() => {
  console.error("Backend non compilé. Lancer d'abord : npm run build");
  process.exit(1);
});
const { PasswordResetService } = await import('../dist/auth-tokens/password-reset.service.js');

// `logger: false` : trente lignes de démarrage Nest noieraient le lien.
const contexte = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const lien = await contexte.get(PasswordResetService).createResetLink(email);

  if (!lien) {
    console.error(`Aucun compte pour « ${email} » sur cette base.`);
    console.error('\nVérifier l’orthographe, ou la base visée :');
    console.error(`  fichier : ${fichier}`);
    console.error(`  base    : ${new URL(process.env.DATABASE_URL).pathname.slice(1)}`);
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('┌─ Lien de réinitialisation ────────────────────────────────');
    console.log(`│ pour    : ${lien.email}`);
    console.log('│ valable : une heure, une seule fois');
    console.log('└───────────────────────────────────────────────────────────');
    console.log('');
    console.log(lien.url);
    console.log('');
    console.log('À transmettre par le moyen de ton choix. Il ne repasse nulle part :');
    console.log('seul son empreinte est en base, et refermer cet écran le perd.');
    console.log('');
    console.log('Si l’adresse ci-dessus ne ressemble pas à celle de ton interface,');
    console.log('c’est que FRONTEND_URL n’est pas la bonne dans ' + fichier + '.');
  }
} finally {
  await contexte.close();
}
