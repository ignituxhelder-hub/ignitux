import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

describe('modèle shopify_connections', () => {
  it('expose bien le delegate Prisma attendu', () => {
    // Prisma 7 exige un adaptateur pour construire le client, même sans
    // jamais se connecter — même patron que PrismaService. La chaîne de
    // connexion n'a pas besoin d'être valide : rien ici n'appelle $connect.
    const adapter = new PrismaPg({ connectionString: 'postgresql://localhost/inutilisee' });
    const prisma = new PrismaClient({ adapter });
    expect(typeof prisma.shopify_connections.findFirst).toBe('function');
    expect(typeof prisma.shopify_connections.upsert).toBe('function');
  });
});
