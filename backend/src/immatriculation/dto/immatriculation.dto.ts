import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Corps du PUT. La forme seulement (types, longueurs grossières) : les clés
 * de contrôle (Luhn, TVA) et les bornes de date sont vérifiées par
 * `normaliserFiche`, testée à part, qui rend des messages précis.
 */
export class PutRegistrationDto {
  @IsString()
  @MinLength(1, { message: 'Le SIREN est obligatoire.' })
  @MaxLength(20)
  siren: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  siret?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string | null;

  @IsString()
  @MinLength(1, { message: 'La dénomination est obligatoire.' })
  @MaxLength(200)
  legalName: string;

  @IsString()
  @MinLength(1, { message: 'L’adresse du siège est obligatoire.' })
  @MaxLength(300)
  headOffice: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'registeredOn s’écrit AAAA-MM-JJ.' })
  registeredOn: string;
}
