import { Equals, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const DOCUMENT_TYPES = ['carte_identite', 'passeport', 'titre_sejour'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export class SubmitDocumentDto {
  @IsIn(DOCUMENT_TYPES, {
    message: `documentType doit être l'un de : ${DOCUMENT_TYPES.join(', ')}.`,
  })
  documentType: DocumentType;
}

export class ReviewVerificationDto {
  @IsIn(['validee', 'rejetee'], { message: "decision doit être 'validee' ou 'rejetee'." })
  decision: 'validee' | 'rejetee';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class CreateMandateDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(100)
  purpose: string;
}

export class SignMandateDto {
  @IsString()
  @MinLength(1, { message: 'nomComplet ne peut pas être vide.' })
  @MaxLength(200)
  nomComplet: string;

  /**
   * La case de consentement cochée : sans elle, la signature électronique
   * simple ne prouve pas que la personne a lu le texte. Exactement `true`
   * (comparaison stricte) — ni absent, ni `false`, ni la chaîne "true".
   */
  @Equals(true, { message: 'Il faut cocher la case de consentement pour signer le mandat.' })
  accepte: boolean;
}

export const FACES_DOCUMENT = { front: 'front', back: 'back' } as const;
export type FaceDocument = (typeof FACES_DOCUMENT)[keyof typeof FACES_DOCUMENT];
