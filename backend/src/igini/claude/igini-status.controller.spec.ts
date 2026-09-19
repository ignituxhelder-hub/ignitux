import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeService } from './claude.service.js';
import { GENERATORS_DISABLED_MESSAGE } from './generators-availability.js';
import { IginiStatusController } from './igini-status.controller.js';

describe('IginiStatusController', () => {
  const availability = vi.fn();
  let controller: IginiStatusController;

  beforeEach(async () => {
    availability.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IginiStatusController],
      providers: [{ provide: ClaudeService, useValue: { availability } }],
    }).compile();

    controller = module.get(IginiStatusController);
  });

  it('annonce les générateurs disponibles sans motif', () => {
    availability.mockReturnValue({ enabled: true, reason: null });

    expect(controller.getStatus()).toEqual({
      generatorsEnabled: true,
      unavailableReason: null,
    });
  });

  it("annonce l'indisponibilité avec le motif à afficher", () => {
    availability.mockReturnValue({ enabled: false, reason: GENERATORS_DISABLED_MESSAGE });

    const status = controller.getStatus();

    expect(status.generatorsEnabled).toBe(false);
    // Le frontend affiche ce texte tel quel : s'il était vide, le bouton
    // serait désactivé sans que personne sache pourquoi.
    expect(status.unavailableReason).toBe(GENERATORS_DISABLED_MESSAGE);
  });
});
