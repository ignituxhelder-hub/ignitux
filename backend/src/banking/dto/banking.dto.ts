import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BANK_ACCOUNT_KINDS } from '../banking.service.js';

export class DeclareBankAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsIn(BANK_ACCOUNT_KINDS, {
    message: `kind doit être l'une de : ${BANK_ACCOUNT_KINDS.join(', ')}.`,
  })
  kind: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * Volontairement borné à quatre caractères par la validation elle-même :
   * un IBAN entier envoyé par erreur est refusé à l'entrée, pas nettoyé
   * en silence plus loin.
   */
  @IsOptional()
  @IsString()
  @Length(4, 4, {
    message: "On n'enregistre que les quatre derniers caractères de l'IBAN, pas davantage.",
  })
  ibanLast4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ledgerAccountCode?: string;
}

export class ImportTransactionDto {
  /** Signé : négatif pour un débit bancaire. */
  @IsInt({ message: 'amountCents doit être un entier (centimes).' })
  amountCents: number;

  @IsDateString()
  occurredOn: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRef?: string;
}

export class ReconcileDto {
  @IsUUID()
  entryId: string;
}
