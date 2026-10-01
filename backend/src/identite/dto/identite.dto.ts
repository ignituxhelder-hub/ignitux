import { IsIn } from 'class-validator';

export const DOCUMENT_TYPES = ['carte_identite', 'passeport', 'titre_sejour'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export class SubmitDocumentDto {
  @IsIn(DOCUMENT_TYPES, {
    message: `documentType doit être l'un de : ${DOCUMENT_TYPES.join(', ')}.`,
  })
  documentType: DocumentType;
}
