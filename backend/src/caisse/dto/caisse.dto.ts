import { IsDateString, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class RecordCaisseDayDto {
  /** Date de la journée de caisse, pas celle de la saisie. */
  @IsDateString()
  occurredOn: string;

  @IsInt({ message: 'cashCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un montant ne peut pas être négatif.' })
  cashCents: number;

  @IsInt({ message: 'cardCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un montant ne peut pas être négatif.' })
  cardCents: number;

  @IsInt({ message: 'vatCents doit être un entier (centimes).' })
  @Min(0, { message: 'Un montant ne peut pas être négatif.' })
  vatCents: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
