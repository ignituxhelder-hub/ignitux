import { IsObject } from 'class-validator';

export class SaveProfileDto {
  /**
   * Les champs à enregistrer, par identifiant du catalogue.
   *
   * Objet libre plutôt qu'une classe par champ : le catalogue vit dans
   * `profile-fields.ts`, et le service ne retient que les clés qu'il y
   * trouve. Une classe figée ici obligerait à modifier trois endroits pour
   * ajouter un champ, et les trois finiraient par diverger.
   */
  @IsObject()
  values!: Record<string, string | string[] | null>;
}
