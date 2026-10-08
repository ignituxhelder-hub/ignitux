import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PIECES_COCHABLES } from '../pieces.js';

export class UpdateCheckedItemsDto {
  // Tableau vide accepté : c'est « je décoche tout ».
  @IsArray()
  @ArrayMaxSize(PIECES_COCHABLES.length)
  @ArrayUnique({ message: 'checkedItems ne doit pas contenir de doublons.' })
  @IsIn(PIECES_COCHABLES, {
    each: true,
    message: `checkedItems ne peut contenir que : ${PIECES_COCHABLES.join(', ')}.`,
  })
  checkedItems: string[];
}

export class MarkDepositedDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'filingReference ne doit pas dépasser 100 caractères.' })
  filingReference?: string;
}
