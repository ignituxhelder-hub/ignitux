import { HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { userOwner } from '../ledger/ledger-owner.js';
import { BankingService } from './banking.service.js';

/**
 * Un compte ou un mouvement qui n'est pas à moi doit répondre exactement
 * comme un identifiant qui n'existe pas : même code, même message. Sinon
 * quelqu'un qui a gardé des identifiants (un comptable retiré, par son cache
 * hors ligne) apprendrait qu'ils existent toujours.
 */

const COMPTE_D_UN_AUTRE = { id: 'b1', owner_type: 'user', owner_id: 'autre' };

function service(compte: unknown, mouvement: unknown) {
  const prisma = {
    bank_accounts: { findUnique: vi.fn().mockResolvedValue(compte) },
    bank_transactions: {
      findUnique: vi.fn().mockResolvedValue(mouvement),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return new BankingService(prisma as never, { guard: vi.fn() } as never);
}

async function reponse(promesse: Promise<unknown>) {
  const erreur = await promesse.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(HttpException);
  return { statut: (erreur as HttpException).getStatus(), message: (erreur as HttpException).message };
}

describe('Banque : un compte ou un mouvement d’un autre ne se distingue pas d’un identifiant inconnu', () => {
  const moi = userOwner('moi');

  it.each([
    ['les mouvements d’un compte', (s: BankingService) => s.listTransactions(moi, 'b1')],
    ['le solde d’un compte', (s: BankingService) => s.balance(moi, 'b1')],
    ['l’import d’un mouvement', (s: BankingService) => s.importTransaction(moi, 'b1', {} as never)],
  ])('%s : même 404 que le compte existe chez un autre ou non', async (_cas, appel) => {
    const chezUnAutre = await reponse(appel(service(COMPTE_D_UN_AUTRE, null)));
    const inexistant = await reponse(appel(service(null, null)));

    expect(chezUnAutre).toEqual(inexistant);
    expect(chezUnAutre.statut).toBe(404);
  });

  it('le rapprochement d’un mouvement : même 404 que le mouvement soit sur le compte d’un autre ou inexistant', async () => {
    const mouvementDUnAutre = { id: 't1', bank_account: COMPTE_D_UN_AUTRE };
    const chezUnAutre = await reponse(service(null, mouvementDUnAutre).reconcile(moi, 't1', 'e1'));
    const inexistant = await reponse(service(null, null).reconcile(moi, 't1', 'e1'));

    expect(chezUnAutre).toEqual(inexistant);
    expect(chezUnAutre.statut).toBe(404);
  });

  it('mon propre compte reste accessible', async () => {
    const s = service({ id: 'b1', owner_type: 'user', owner_id: 'moi' }, null);
    await expect(s.listTransactions(moi, 'b1')).resolves.not.toBeInstanceOf(NotFoundException);
  });
});
