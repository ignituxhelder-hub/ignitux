import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { VehiculesService } from './vehicules.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('VehiculesService', () => {
  let service: VehiculesService;
  let prisma: {
    fleet_vehicles: { create: Mock; findMany: Mock; findFirst: Mock; update: Mock; delete: Mock };
    fleet_entries: { create: Mock; findMany: Mock };
  };

  beforeEach(async () => {
    prisma = {
      fleet_vehicles: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      fleet_entries: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VehiculesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VehiculesService>(VehiculesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloisonnement', () => {
    it("ne liste que les véhicules de l'appelant", async () => {
      await service.listVehicles('u1');

      expect(prisma.fleet_vehicles.findMany.mock.calls[0][0].where.owner_id).toBe('u1');
    });

    it("refuse de modifier le véhicule d'un autre utilisateur", async () => {
      prisma.fleet_vehicles.findFirst.mockResolvedValue(null);

      await expect(service.updateVehicle('u2', 'v1', { label: 'Fourgon' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse un relevé sur un véhicule introuvable', async () => {
      prisma.fleet_vehicles.findFirst.mockResolvedValue(null);

      await expect(
        service.recordEntry('u1', 'introuvable', { costCents: 5000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('le coût au kilomètre', () => {
    beforeEach(() => {
      prisma.fleet_vehicles.findFirst.mockResolvedValue({ id: 'v1', owner_id: 'u1' });
    });

    it('reste null avec moins de deux relevés kilométriques', async () => {
      prisma.fleet_entries.findMany.mockResolvedValue([
        { id: 'e1', vehicle_id: 'v1', cost_cents: 5000, odometer_km: 1000, reason: null, occurred_on: new Date(), created_at: new Date() },
      ]);

      const { costPerKmCents } = await service.listEntries('u1', 'v1');

      expect(costPerKmCents).toBeNull();
    });

    it('se calcule sur la distance entre le premier et le dernier relevé', async () => {
      prisma.fleet_entries.findMany.mockResolvedValue([
        { id: 'e1', vehicle_id: 'v1', cost_cents: 6000, odometer_km: 1100, reason: null, occurred_on: new Date(), created_at: new Date() },
        { id: 'e2', vehicle_id: 'v1', cost_cents: 4000, odometer_km: 1000, reason: null, occurred_on: new Date(), created_at: new Date() },
      ]);

      const { costPerKmCents, totalCostCents } = await service.listEntries('u1', 'v1');

      expect(totalCostCents).toBe(10000);
      expect(costPerKmCents).toBe(100);
    });

    it('reste null quand la distance parcourue est nulle', async () => {
      prisma.fleet_entries.findMany.mockResolvedValue([
        { id: 'e1', vehicle_id: 'v1', cost_cents: 5000, odometer_km: 1000, reason: null, occurred_on: new Date(), created_at: new Date() },
        { id: 'e2', vehicle_id: 'v1', cost_cents: 3000, odometer_km: 1000, reason: null, occurred_on: new Date(), created_at: new Date() },
      ]);

      const { costPerKmCents } = await service.listEntries('u1', 'v1');

      expect(costPerKmCents).toBeNull();
    });
  });
});
