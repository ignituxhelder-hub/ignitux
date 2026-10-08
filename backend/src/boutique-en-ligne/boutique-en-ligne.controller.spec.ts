import { BoutiqueEnLigneController } from './boutique-en-ligne.controller.js';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

type Mock = ReturnType<typeof vi.fn>;

describe('BoutiqueEnLigneController', () => {
  let controller: BoutiqueEnLigneController;
  let service: Record<string, Mock>;
  const USER = { id: 'u1', email: 'u1@ignitux.test' };

  beforeEach(() => {
    service = {
      etat: vi.fn().mockResolvedValue({ connectee: false }),
      demarrerConnexion: vi.fn().mockResolvedValue({ url: 'https://...' }),
      finaliserConnexion: vi.fn().mockResolvedValue(undefined),
      deconnecter: vi.fn().mockResolvedValue(undefined),
      declarerForfait: vi.fn().mockResolvedValue(undefined),
      listerProduits: vi.fn().mockResolvedValue([]),
      creerProduit: vi.fn().mockResolvedValue({}),
      listerCommandes: vi.fn().mockResolvedValue([]),
    };
    controller = new BoutiqueEnLigneController(service as unknown as BoutiqueEnLigneService);
  });

  it('relaie etat avec l’utilisateur et le projet', async () => {
    await controller.etat(USER, 'p1');
    expect(service.etat).toHaveBeenCalledWith('u1', 'p1');
  });

  it('relaie demarrerConnexion avec le domaine du DTO', async () => {
    await controller.demarrerConnexion(USER, 'p1', { shopDomain: 'x.myshopify.com' });
    expect(service.demarrerConnexion).toHaveBeenCalledWith('u1', 'p1', 'x.myshopify.com');
  });

  it('relaie finaliser avec l’utilisateur, le projet et le corps reçu de Shopify', async () => {
    const dto = { code: 'c', shop: 's.myshopify.com', state: 'etat', hmac: 'h' };
    await controller.finaliser(USER, 'p1', dto);
    expect(service.finaliserConnexion).toHaveBeenCalledWith('u1', 'p1', dto);
  });

  it('relaie creerProduit avec description null par défaut', async () => {
    await controller.creerProduit(USER, 'p1', { titre: 'Bougie' });
    expect(service.creerProduit).toHaveBeenCalledWith('u1', 'p1', 'Bougie', null);
  });
});
