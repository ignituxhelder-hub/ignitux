import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const STOCK_UNITS = ['unite', 'kg', 'litre', 'heure', 'autre'] as const;

export class CreateStockItemDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1, { message: 'Un article a un nom.' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsIn(STOCK_UNITS, { message: `unit doit être l'une de : ${STOCK_UNITS.join(', ')}.` })
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Un seuil d’alerte ne peut pas être négatif.' })
  alertBelow?: number;
}

export class UpdateStockItemDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Un article a un nom.' })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(STOCK_UNITS, { message: `unit doit être l'une de : ${STOCK_UNITS.join(', ')}.` })
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Un seuil d’alerte ne peut pas être négatif.' })
  alertBelow?: number;
}

export class RecordStockMovementDto {
  // Signé : positif pour une entrée, négatif pour une sortie. Pas de
  // @Min(0) ici, contrairement à ledger.dto.ts — c'est justement le signe
  // qui distingue les deux sens, il n'y a pas de colonne séparée.
  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  occurredOn?: string;
}
