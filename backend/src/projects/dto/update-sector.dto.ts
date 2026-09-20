import { IsIn, IsOptional, IsString } from 'class-validator';
import { SECTEURS } from '../../profile/profile-fields.js';

/**
 * Le secteur DU PROJET.
 *
 * Contraint à la liste, contrairement au titre et à la description qui sont
 * du texte libre : un secteur hors liste ne correspondrait à aucune démarche
 * du référentiel, donc ne trierait rien — et le silence serait pris pour
 * « rien ne te concerne ». Mieux vaut refuser la valeur.
 *
 * `null` est accepté : on doit pouvoir retirer une réponse donnée par
 * erreur, et une réponse fausse sur un tri d'obligations légales vaut moins
 * que pas de réponse du tout.
 */
export class UpdateSectorDto {
  @IsOptional()
  @IsString()
  @IsIn(SECTEURS as unknown as string[], {
    message: `Secteur inconnu. Valeurs acceptées : ${SECTEURS.join(', ')}.`,
  })
  sector?: string | null;
}
