import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}
