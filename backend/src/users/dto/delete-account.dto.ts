import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /**
   * Le mot de passe est redemandé pour une action irréversible : un jeton
   * volé ou un onglet resté ouvert ne doit pas suffire à effacer un compte.
   */
  @IsString()
  @MinLength(1, { message: 'Le mot de passe est requis pour supprimer le compte.' })
  password: string;
}
