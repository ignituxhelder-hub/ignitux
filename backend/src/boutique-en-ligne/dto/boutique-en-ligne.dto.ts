import { IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class DemarrerConnexionDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, {
    message: 'Le domaine doit être un sous-domaine « *.myshopify.com ».',
  })
  shopDomain: string;
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
