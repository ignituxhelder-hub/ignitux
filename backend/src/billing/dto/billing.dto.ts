import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, PAYMENT_METHODS } from '../billing-rules.js';

export class DocumentLineDto {
  @IsString()
  @MinLength(1, { message: 'label ne peut pas être vide.' })
  @MaxLength(300)
  label: string;

  /** Quantité en millièmes : 1500 = 1,5 unité. */
  @IsInt({ message: 'quantityMilli doit être un entier (millièmes d\'unité).' })
  @Min(1, { message: 'La quantité doit être strictement positive.' })
  quantityMilli: number;

  /** Prix unitaire en centimes. Négatif autorisé : une remise en est un. */
  @IsInt({ message: 'unitPriceCents doit être un entier (centimes).' })
  unitPriceCents: number;

  /** Taux de TVA en pour mille : 2000 = 20 %, 550 = 5,5 %. */
  @IsOptional()
  @IsInt({ message: 'vatRateBasisPoints doit être un entier (pour mille).' })
  @Min(0)
  @Max(10000, { message: 'Un taux de TVA supérieur à 1000 % est nécessairement une erreur.' })
  vatRateBasisPoints?: number;
}

export class CreateDocumentDto {
  @IsIn(DOCUMENT_TYPES, { message: `type doit être l'un de : ${DOCUMENT_TYPES.join(', ')}.` })
  type: string;

  @IsString()
  @MinLength(1, { message: 'clientName ne peut pas être vide.' })
  @MaxLength(200)
  clientName: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  correctsId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Un document doit comporter au moins une ligne.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines: DocumentLineDto[];
}

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines?: DocumentLineDto[];
}

export class ChangeStatusDto {
  @IsIn(DOCUMENT_STATUSES, {
    message: `status doit être l'un de : ${DOCUMENT_STATUSES.join(', ')}.`,
  })
  status: string;
}

export class AddPaymentDto {
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  @Min(1, { message: 'Le montant du règlement doit être strictement positif.' })
  amountCents: number;

  @IsIn(PAYMENT_METHODS, { message: `method doit être l'un de : ${PAYMENT_METHODS.join(', ')}.` })
  method: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
