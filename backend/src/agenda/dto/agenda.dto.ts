import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAgendaEventDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsString()
  @MinLength(1, { message: 'Un rendez-vous a un titre.' })
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsISO8601({}, { message: 'occurredAt doit être une date valide.' })
  occurredAt: string;
}

export class UpdateAgendaEventDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Un rendez-vous a un titre.' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'occurredAt doit être une date valide.' })
  occurredAt?: string;
}
