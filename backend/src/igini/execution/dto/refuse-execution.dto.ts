import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Corps du refus : le motif est facultatif, le corps entier peut être absent. */
export class RefuseExecutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'reason ne doit pas dépasser 500 caractères.' })
  reason?: string;
}
