import { IsIn, IsOptional } from 'class-validator';

export const LEGAL_FORMS = ['micro-entreprise', 'EI', 'EURL', 'SASU', 'SARL', 'SAS'] as const;

/**
 * Mêmes six formes que Former (`src/igini/former/former.service.ts`). Pas
 * d'import croisé entre les deux fichiers pour cette seule constante : la
 * dupliquer ici évite un couplage entre le module projects et un module
 * igini pour une liste qui ne change pas souvent, et qui est déjà dupliquée
 * dans le commentaire de schema.prisma.
 */
export class UpdateLegalFormDto {
  @IsOptional()
  @IsIn(LEGAL_FORMS, {
    message: `Forme juridique inconnue. Valeurs acceptées : ${LEGAL_FORMS.join(', ')}.`,
  })
  legalForm?: (typeof LEGAL_FORMS)[number] | null;
}
