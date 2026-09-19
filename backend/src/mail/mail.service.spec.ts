import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it("n'envoie rien reellement (pas de fournisseur configure) et ne leve pas d'erreur", async () => {
    await expect(
      service.send({ to: 'a@b.com', subject: 'Test', text: 'Contenu du mail.' }),
    ).resolves.toBeUndefined();
  });
});
