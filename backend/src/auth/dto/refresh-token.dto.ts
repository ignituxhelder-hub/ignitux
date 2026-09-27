import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @MinLength(1, { message: 'Le jeton de rafraîchissement est requis.' })
  refreshToken: string;
}
