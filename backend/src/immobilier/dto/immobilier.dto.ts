import { IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePropertyDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1, { message: 'Un bien a un nom.' })
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class UpdatePropertyDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Un bien a un nom.' })
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class RecordPropertyMovementDto {
  // Signé : positif pour un loyer perçu, négatif pour une charge payée —
  // même convention que stocks (RecordStockMovementDto.quantity).
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  amountCents: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  occurredOn?: string;
}
