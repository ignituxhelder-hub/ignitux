import { ForbiddenException } from '@nestjs/common';
import { dansUnContexteEspace, noterEspaceResolu } from './contexte-espace.js';
import { ResoudreEspacePipe } from './espace.decorator.js';
import { EspaceService } from './espace.service.js';

const MOI = '11111111-1111-4111-8111-111111111111';
const PROPRIO = '22222222-2222-4222-8222-222222222222';

describe('contexte d’espace : la preuve que l’intercepteur est câblé', () => {
  it('hors requête (tâche de fond, intercepteur absent) : rien n’est noté', () => {
    expect(noterEspaceResolu(MOI, PROPRIO)).toBe(false);
  });

  it('dans un contexte, la résolution est notée, y compris après un await', async () => {
    await dansUnContexteEspace(async () => {
      expect(noterEspaceResolu(MOI, MOI)).toBe(true);
      await new Promise((resolve) => setImmediate(resolve));
      expect(noterEspaceResolu(MOI, PROPRIO)).toBe(true);
    });
  });
});

describe('ResoudreEspacePipe : fermé par défaut sans contexte', () => {
  const espaces = new EspaceService({
    // Comptable ajouté après la date limite, sans choix du propriétaire :
    // accès automatique.
    project_collaborators: { findMany: async () => [{ role: 'comptable', created_at: new Date('2026-10-20T09:00:00Z') }] },
    space_members: { findUnique: async () => null },
  } as never);
  const pipe = new ResoudreEspacePipe(espaces);
  const demande = (enTete?: string) => ({
    domaine: 'argent' as const,
    requete: { user: { id: MOI }, headers: enTete ? { 'x-espace': enTete } : {} },
  });

  it('un espace étranger résolu hors contexte est refusé (intercepteur absent = câblage cassé)', async () => {
    await expect(pipe.transform(demande(PROPRIO))).rejects.toThrow(new ForbiddenException('Espace indéterminable.'));
  });

  it('dans un contexte, l’espace étranger passe et y est noté', async () => {
    await dansUnContexteEspace(async () => {
      const requete = demande(PROPRIO);
      await expect(pipe.transform(requete)).resolves.toBe(PROPRIO);
      expect(requete.requete).toMatchObject({ espace: { ownerId: PROPRIO, domaine: 'argent' } });
    });
  });

  it('chez soi, même sans contexte, rien ne change', async () => {
    await expect(pipe.transform(demande())).resolves.toBe(MOI);
  });

  it('sans utilisateur (route montée sans JwtAuthGuard) : 403, jamais un espace par défaut', async () => {
    await expect(
      pipe.transform({ domaine: 'argent', requete: { headers: { 'x-espace': PROPRIO } } }),
    ).rejects.toThrow(new ForbiddenException('Espace indéterminable.'));
  });
});
