import { ForbiddenException } from '@nestjs/common';
import { dansUnContexteEspace, dansUnEspaceEtranger, noterEspaceResolu } from './contexte-espace.js';
import { ResoudreEspacePipe } from './espace.decorator.js';
import { EspaceService } from './espace.service.js';

const MOI = '11111111-1111-4111-8111-111111111111';
const PROPRIO = '22222222-2222-4222-8222-222222222222';

describe('contexte d’espace : chez qui agit la requête', () => {
  it('hors requête (tâche de fond) : jamais « chez un autre »', () => {
    expect(dansUnEspaceEtranger()).toBe(false);
    expect(noterEspaceResolu(MOI, PROPRIO)).toBe(false);
  });

  it('chez soi (espace résolu = moi) : pas étranger', () => {
    dansUnContexteEspace(() => {
      expect(noterEspaceResolu(MOI, MOI)).toBe(true);
      expect(dansUnEspaceEtranger()).toBe(false);
    });
  });

  it('dans l’espace d’un autre, y compris après un await', async () => {
    await dansUnContexteEspace(async () => {
      noterEspaceResolu(MOI, PROPRIO);
      await new Promise((resolve) => setImmediate(resolve));
      expect(dansUnEspaceEtranger()).toBe(true);
    });
  });

  it('deux requêtes simultanées ne se mélangent pas', async () => {
    const vus: Array<[string, boolean]> = [];
    await Promise.all([
      dansUnContexteEspace(async () => {
        noterEspaceResolu(MOI, PROPRIO);
        await new Promise((resolve) => setTimeout(resolve, 5));
        vus.push(['etranger', dansUnEspaceEtranger()]);
      }),
      dansUnContexteEspace(async () => {
        noterEspaceResolu(PROPRIO, PROPRIO);
        await new Promise((resolve) => setTimeout(resolve, 1));
        vus.push(['chez-soi', dansUnEspaceEtranger()]);
      }),
    ]);
    expect(Object.fromEntries(vus)).toEqual({ etranger: true, 'chez-soi': false });
  });
});

describe('ResoudreEspacePipe : fermé par défaut sans contexte', () => {
  const espaces = new EspaceService({
    project_collaborators: { findFirst: async () => ({ role: 'comptable' }) },
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
      await expect(pipe.transform(demande(PROPRIO))).resolves.toBe(PROPRIO);
      expect(dansUnEspaceEtranger()).toBe(true);
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
