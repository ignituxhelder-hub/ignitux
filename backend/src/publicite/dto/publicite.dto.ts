import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1, { message: 'Une campagne a un nom.' })
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  channel?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Une campagne a un nom.' })
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  channel?: string;
}

export class RecordCampaignEntryDto {
  @IsInt({ message: 'spentCents doit être un entier (centimes).' })
  @Min(0, { message: 'Une dépense ne peut pas être négative.' })
  spentCents: number;

  @IsOptional()
  @IsInt({ message: 'leads doit être un entier.' })
  @Min(0, { message: 'Un nombre de prospects ne peut pas être négatif.' })
  leads?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  occurredOn?: string;
}
