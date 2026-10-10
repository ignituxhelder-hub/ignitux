import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Corps du PUT. La forme seulement (types, longueurs grossières) : les clés
 * de contrôle (Luhn, TVA) et les bornes de date sont vérifiées par
 * `normaliserFiche`, testée à part, qui rend des messages précis.
 *
 * Chaque message est en français et désigne le champ par son nom affiché,
 * jamais par son nom technique : il est montré tel quel à la personne.
 */
export class PutRegistrationDto {
  @IsString({ message: 'Le SIREN s’écrit en chiffres, sous forme de texte.' })
  @MinLength(1, { message: 'Le SIREN est obligatoire.' })
  @MaxLength(20, { message: 'Le SIREN est trop long.' })
  siren: string;

  @IsOptional()
  @IsString({ message: 'Le SIRET s’écrit en chiffres, sous forme de texte.' })
  @MaxLength(30, { message: 'Le SIRET est trop long.' })
  siret?: string | null;

  @IsOptional()
  @IsString({ message: 'Le numéro de TVA s’écrit sous forme de texte.' })
  @MaxLength(30, { message: 'Le numéro de TVA est trop long.' })
  vatNumber?: string | null;

  @IsString({ message: 'La dénomination s’écrit sous forme de texte.' })
  @MinLength(1, { message: 'La dénomination est obligatoire.' })
  @MaxLength(200, { message: 'La dénomination fait au plus 200 caractères.' })
  legalName: string;

  @IsString({ message: 'L’adresse du siège s’écrit sous forme de texte.' })
  @MinLength(1, { message: 'L’adresse du siège est obligatoire.' })
  @MaxLength(300, { message: 'L’adresse du siège fait au plus 300 caractères.' })
  headOffice: string;

  @IsString({ message: 'La date d’immatriculation est obligatoire.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date d’immatriculation s’écrit AAAA-MM-JJ.' })
  registeredOn: string;
}

/**
 * Corps du POST capital : le montant et la date que la personne a vus et
 * confirmés. Le serveur recalcule la proposition et refuse (409) si l'un des
 * deux a changé depuis l'affichage — on n'enregistre jamais autre chose que
 * ce qui a été montré.
 */
export class ConfirmerCapitalDto {
  @IsInt({ message: 'Le montant confirmé est un nombre entier de centimes.' })
  @Min(1, { message: 'Le montant confirmé doit être positif.' })
  montantCents: number;

  @IsString({ message: 'La date de l’écriture est obligatoire.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de l’écriture s’écrit AAAA-MM-JJ.' })
  date: string;
}
