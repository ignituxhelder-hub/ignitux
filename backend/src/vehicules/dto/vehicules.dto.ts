import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @MinLength(1, { message: 'Un véhicule a un nom.' })
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plate?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Un véhicule a un nom.' })
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plate?: string;
}

export class RecordVehicleEntryDto {
  @IsInt({ message: 'costCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un coût ne peut pas être négatif.' })
  costCents: number;

  @IsOptional()
  @IsInt({ message: 'odometerKm doit être un entier (kilomètres).' })
  @Min(0, { message: 'Un kilométrage ne peut pas être négatif.' })
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  occurredOn?: string;
}
