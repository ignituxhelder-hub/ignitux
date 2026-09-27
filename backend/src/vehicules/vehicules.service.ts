import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateVehicleInput {
  label: string;
  plate?: string;
}

export interface UpdateVehicleInput {
  label?: string;
  plate?: string;
}

export interface RecordEntryInput {
  costCents: number;
  odometerKm?: number;
  reason?: string;
  occurredOn?: Date;
}

export interface VehicleEntries {
  entries: Array<{
    id: string;
    vehicle_id: string;
    cost_cents: number;
    odometer_km: number | null;
    reason: string | null;
    occurred_on: Date;
    created_at: Date | null;
  }>;
  totalCostCents: number;
  /**
   * Dépense totale ÷ kilomètres parcourus entre le premier et le dernier
   * relevé au compteur. `null` tant qu'il n'y a pas au moins deux relevés
   * kilométriques — un coût au kilomètre calculé sur un seul point n'aurait
   * aucun kilomètre à diviser, et un chiffre inventé serait pire que rien.
   */
  costPerKmCents: number | null;
}

/**
 * VÉHICULES — la flotte suivie, scopée à son propriétaire. Contrairement à
 * Stocks/Immobilier, rien n'est dénormalisé sur le véhicule lui-même : le
 * coût au kilomètre dépend de DEUX relevés (le premier et le dernier), pas
 * d'une simple somme, et se recalcule à la lecture plutôt que d'être stocké
 * — un relevé corrigé après coup ne doit pas laisser un chiffre périmé.
 */
@Injectable()
export class VehiculesService {
  constructor(private readonly prisma: PrismaService) {}

  createVehicle(ownerId: string, input: CreateVehicleInput) {
    return this.prisma.fleet_vehicles.create({
      data: {
        owner_id: ownerId,
        label: input.label,
        plate: input.plate ?? null,
      },
    });
  }

  listVehicles(ownerId: string) {
    return this.prisma.fleet_vehicles.findMany({
      where: { owner_id: ownerId },
      orderBy: { label: 'asc' },
    });
  }

  async updateVehicle(ownerId: string, id: string, input: UpdateVehicleInput) {
    await this.findVehicleForOwner(ownerId, id);

    return this.prisma.fleet_vehicles.update({
      where: { id },
      data: { label: input.label, plate: input.plate },
    });
  }

  async deleteVehicle(ownerId: string, id: string): Promise<void> {
    await this.findVehicleForOwner(ownerId, id);
    await this.prisma.fleet_vehicles.delete({ where: { id } });
  }

  async recordEntry(ownerId: string, vehicleId: string, input: RecordEntryInput) {
    await this.findVehicleForOwner(ownerId, vehicleId);

    return this.prisma.fleet_entries.create({
      data: {
        vehicle_id: vehicleId,
        cost_cents: input.costCents,
        odometer_km: input.odometerKm ?? null,
        reason: input.reason ?? null,
        occurred_on: input.occurredOn ?? new Date(),
      },
    });
  }

  async listEntries(ownerId: string, vehicleId: string): Promise<VehicleEntries> {
    await this.findVehicleForOwner(ownerId, vehicleId);

    const entries = await this.prisma.fleet_entries.findMany({
      where: { vehicle_id: vehicleId },
      orderBy: [{ occurred_on: 'desc' }, { created_at: 'desc' }],
    });

    const totalCostCents = entries.reduce((total, entry) => total + entry.cost_cents, 0);

    const releves = entries
      .map((entry) => entry.odometer_km)
      .filter((km): km is number => km !== null);
    let costPerKmCents: number | null = null;
    if (releves.length >= 2) {
      const distanceKm = Math.max(...releves) - Math.min(...releves);
      if (distanceKm > 0) {
        costPerKmCents = totalCostCents / distanceKm;
      }
    }

    return { entries, totalCostCents, costPerKmCents };
  }

  private async findVehicleForOwner(ownerId: string, id: string) {
    const vehicle = await this.prisma.fleet_vehicles.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!vehicle) {
      throw new NotFoundException('Véhicule introuvable.');
    }
    return vehicle;
  }
}
