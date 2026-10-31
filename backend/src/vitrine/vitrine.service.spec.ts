import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VitrineController } from './vitrine.controller.js';
import { SEUIL_COMPTEUR, VitrineService } from './vitrine.service.js';

function service(count: ReturnType<typeof vi.fn>) {
  const prisma = { projects: { count } } as unknown as PrismaService;
  return new VitrineService(prisma);
}

describe('VitrineService.projetsAffiches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne compte que les projets en cours, pas les archivés', async () => {
    const count = vi.fn().mockResolvedValue(120);
    await service(count).projetsAffiches();

    expect(count).toHaveBeenCalledWith({ where: { archived_at: null } });
  });

  it('ne dit rien sous le seuil', async () => {
    expect(SEUIL_COMPTEUR).toBe(50);
    await expect(service(vi.fn().mockResolvedValue(0)).projetsAffiches()).resolves.toBeNull();
    await expect(service(vi.fn().mockResolvedValue(49)).projetsAffiches()).resolves.toBeNull();
  });

  it('arrondit à la dizaine inférieure : le chiffre affiché reste vrai', async () => {
    await expect(service(vi.fn().mockResolvedValue(50)).projetsAffiches()).resolves.toBe(50);
    await expect(service(vi.fn().mockResolvedValue(57)).projetsAffiches()).resolves.toBe(50);
    await expect(service(vi.fn().mockResolvedValue(1234)).projetsAffiches()).resolves.toBe(1230);
  });

  it('garde le chiffre dix minutes, puis recompte', async () => {
    const count = vi.fn().mockResolvedValueOnce(60).mockResolvedValueOnce(75);
    const vitrine = service(count);

    await expect(vitrine.projetsAffiches()).resolves.toBe(60);
    vi.advanceTimersByTime(9 * 60_000);
    await expect(vitrine.projetsAffiches()).resolves.toBe(60);
    expect(count).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60_000);
    await expect(vitrine.projetsAffiches()).resolves.toBe(70);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('une base indisponible donne `null`, sans garder l’échec', async () => {
    const count = vi.fn().mockRejectedValueOnce(new Error('base indisponible')).mockResolvedValueOnce(80);
    const vitrine = service(count);

    await expect(vitrine.projetsAffiches()).resolves.toBeNull();
    await expect(vitrine.projetsAffiches()).resolves.toBe(80);
  });
});

describe('VitrineController', () => {
  it('rend le compteur sous la forme { projets }', async () => {
    const controleur = new VitrineController({ projetsAffiches: vi.fn().mockResolvedValue(null) } as never);

    await expect(controleur.compteur()).resolves.toEqual({ projets: null });
  });
});
