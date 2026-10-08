import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class DemarrerConnexionDto {
  // Insensible à la casse : le service normalise (trim + minuscules) avant
  // de signer l'état, donc ce contrôle ne doit pas refuser ce que le
  // service accepterait de toute façon une fois normalisé.
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, {
    message: 'Le domaine doit être un sous-domaine « *.myshopify.com ».',
  })
  shopDomain: string;
}

export class FinaliserConnexionDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  shop: string;

  @IsString()
  @MinLength(1)
  state: string;

  @IsString()
  @MinLength(1)
  hmac: string;
}

export class DeclarerForfaitDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du forfait ne peut pas être vide.' })
  forfait: string;

  @IsInt()
  @Min(0, { message: 'Un prix ne peut pas être négatif.' })
  prixCentimes: number;
}

export class CreerProduitDto {
  @IsString()
  @MinLength(1, { message: 'Un produit a un titre.' })
  titre: string;

  @IsOptional()
  @IsString()
  description?: string;
}
