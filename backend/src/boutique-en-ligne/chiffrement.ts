import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHME = 'aes-256-gcm';

/**
 * 64 caractères hexadécimaux = 32 octets, exigés par AES-256. Refusé
 * plutôt que dérivé d'une chaîne plus courte : une clé plus faible que ce
 * qu'elle prétend être ne doit jamais passer inaperçue.
 */
function cle(): Buffer {
  const brut = process.env.SECRETS_ENCRYPTION_KEY?.trim() ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(brut)) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY doit être 64 caractères hexadécimaux (32 octets). ' +
        'Génère-en une avec : openssl rand -hex 32',
    );
  }
  return Buffer.from(brut, 'hex');
}

export function chiffrer(clair: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv(ALGORITHME, cle(), iv);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  const balise = chiffreur.getAuthTag();
  return [iv, balise, chiffre].map((b) => b.toString('hex')).join(':');
}

export function dechiffrer(valeur: string): string {
  const [ivHex, baliseHex, chiffreHex] = valeur.split(':');
  if (!ivHex || !baliseHex || !chiffreHex) {
    throw new Error('Valeur chiffrée illisible.');
  }
  const dechiffreur = createDecipheriv(ALGORITHME, cle(), Buffer.from(ivHex, 'hex'));
  dechiffreur.setAuthTag(Buffer.from(baliseHex, 'hex'));
  return Buffer.concat([
    dechiffreur.update(Buffer.from(chiffreHex, 'hex')),
    dechiffreur.final(),
  ]).toString('utf8');
}
