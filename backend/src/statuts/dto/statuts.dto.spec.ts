import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateBylawsDto } from './statuts.dto.js';

describe('GenerateBylawsDto', () => {
  const corps = (capitalCents: number) =>
    plainToInstance(GenerateBylawsDto, {
      capitalCents,
      headOffice: 'Paris',
      durationYears: 99,
      associates: [{ fullName: 'Alice', shareBasisPoints: 10000 }],
    });
  const champsEnErreur = async (capitalCents: number) =>
    (await validate(corps(capitalCents))).map((e) => e.property);

  it('accepte le plus grand capital qu’une colonne Int Postgres peut stocker', async () => {
    expect(await champsEnErreur(2_147_483_647)).toEqual([]);
  });

  it('refuse un capital au-delà, plutôt qu’une erreur de base à l’écriture', async () => {
    expect(await champsEnErreur(2_147_483_648)).toEqual(['capitalCents']);
  });
});
