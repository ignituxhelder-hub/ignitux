import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BoutiqueEnLigneService } from './boutique-en-ligne.service.js';

interface ReponseRedirection {
  redirect: (url: string) => void;
}

/**
 * Un callback public ne prouve jamais l'identité de la personne qui le
 * présente — seulement que Shopify l'a signé. Ce contrôleur ne fait donc
 * que ça : vérifier la signature, puis renvoyer le navigateur vers le
 * frontend AUTHENTIFIÉ, qui appellera POST .../finaliser avec son propre
 * jeton Ignitux. La finalisation elle-même — et la vérification que la
 * personne qui finalise est celle qui a démarré la demande — vit dans
 * BoutiqueEnLigneService.finaliserConnexion.
 */
@ApiTags('boutique-en-ligne')
@Controller('boutique-en-ligne')
export class BoutiqueEnLigneCallbackController {
  private readonly logger = new Logger(BoutiqueEnLigneCallbackController.name);

  constructor(private readonly service: BoutiqueEnLigneService) {}

  @Get('callback')
  callback(
    @Query() query: Record<string, string>,
    @Res({ passthrough: false }) res: ReponseRedirection,
  ): void {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const resultat = this.service.verifierSignatureCallback(query);

    if (!resultat.ok || !resultat.projectId) {
      this.logger.error('Callback Shopify refusé : signature ou état invalide.');
      res.redirect(`${frontend}/boutique-en-ligne?erreur=1`);
      return;
    }

    const parametres = new URLSearchParams({
      projet: resultat.projectId,
      shopify_code: query.code ?? '',
      shopify_shop: query.shop ?? '',
      shopify_state: query.state ?? '',
      shopify_hmac: query.hmac ?? '',
    });
    res.redirect(`${frontend}/boutique-en-ligne?${parametres.toString()}`);
  }
}
