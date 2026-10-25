import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min, NotEquals } from 'class-validator';
import { AJUSTEMENT_MAX, MOTIF_MAX, MOTIF_MIN } from '../credits.service.js';

/** Ajouter (positif) ou retirer (négatif) des crédits à un compte — administrateurs seulement. */
export class AjusterCreditsDto {
  @IsInt({ message: 'credits doit être un nombre entier.' })
  @NotEquals(0, { message: 'credits ne peut pas valoir 0.' })
  @Min(-AJUSTEMENT_MAX, { message: `credits doit être au moins -${AJUSTEMENT_MAX}.` })
  @Max(AJUSTEMENT_MAX, { message: `credits doit être au plus ${AJUSTEMENT_MAX}.` })
  credits: number;

  /** Obligatoire : « test », « geste commercial »… Les espaces autour ne comptent pas. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'motif doit être un texte.' })
  @Length(MOTIF_MIN, MOTIF_MAX, { message: `motif doit faire entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères.` })
  motif: string;
}
