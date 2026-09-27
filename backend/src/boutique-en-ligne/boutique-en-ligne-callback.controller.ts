import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

interface ReponseRedirection {
  redirect: (url: string) => void;
}

@ApiTags('boutique-en-ligne')
@Controller('boutique-en-ligne')
export class BoutiqueEnLigneCallbackController {
  private readonly logger = new Logger(BoutiqueEnLigneCallbackController.name);

  constructor(private readonly service: BoutiqueEnLigneService) {}

  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Res({ passthrough: false }) res: ReponseRedirection,
  ): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? '';
    try {
      await this.service.traiterCallback(query);
      res.redirect(`${frontend}/boutique-en-ligne?connecte=1`);
    } catch (error) {
      this.logger.error(
        `Callback Shopify refusé : ${error instanceof Error ? error.message : String(error)}`,
      );
      res.redirect(`${frontend}/boutique-en-ligne?erreur=1`);
    }
  }
}
