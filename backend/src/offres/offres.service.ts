import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { peut, type Action, type Verdict } from './droits.js';
import {
  CATALOGUE,
  estOffre,
  EVALUATION_FINANCEMENT,
  offre,
  OFFRE_PAR_DEFAUT,
  prixCentimes,
  type OffreId,
} from './offres-catalogue.js';

/**
 * L'OFFRE D'UNE PERSONNE — la lire, la changer, et refuser ce qu'elle ne
 * couvre pas.
 *
 * Le raisonnement n'est pas ici : il vit dans `offres-catalogue.ts` et
 * `droits.ts`, qui sont purs. Ce service ne fait que lire la ligne en base
 * et poser la question.
 *
 * ## Pourquoi on ne peut pas se donner une offre payante
 *
 * Tant qu'aucun fournisseur de paiement n'est configuré, changer d'offre
 * vers une offre payante est refusé. Ce n'est pas une précaution excessive :
 * une route qui accorde Construction sans rien encaisser est une route qui
 * donne le produit, et elle finirait par être trouvée.
 *
 * Le jour où l'encaissement existe, c'est le fournisseur qui confirmera le
 * paiement — par sa notification, pas par un clic dans l'interface. La
 * fonction qui écrit l'offre est déjà écrite pour ça : elle prend la
 * référence du fournisseur.
 */
@Injectable()
export class OffresService {
  private readonly logger = new Logger(OffresService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Le fournisseur de paiement configuré, ou null quand il n'y en a pas. */
  private fournisseurDePaiement(): string | null {
    const brut = process.env.PAIEMENT_FOURNISSEUR?.trim();
    if (!brut || brut === 'aucun') return null;
    return brut;
  }

  /**
   * L'offre portée par ce compte.
   *
   * Sans ligne, sans offre lisible, ou si la lecture échoue : Découverte.
   * Le repli ne prive de rien, alors qu'une erreur propagée priverait
   * quelqu'un de son produit à cause d'un incident de base.
   */
  async offreDe(userId: string): Promise<OffreId> {
    try {
      const ligne = await this.prisma.subscriptions.findUnique({
        where: { user_id: userId },
        select: { offre: true, ends_on: true },
      });
      if (!ligne) return OFFRE_PAR_DEFAUT;
      // Un engagement terminé retombe sur la gratuite plutôt que de laisser
      // ouvert : l'inverse ferait payer une fois pour toujours.
      if (ligne.ends_on && ligne.ends_on.getTime() < Date.now()) return OFFRE_PAR_DEFAUT;
      return estOffre(ligne.offre) ? ligne.offre : OFFRE_PAR_DEFAUT;
    } catch (error) {
      this.logger.error(
        `Lecture de l'offre impossible pour ${userId} — repli sur ${OFFRE_PAR_DEFAUT}. ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return OFFRE_PAR_DEFAUT;
    }
  }

  /** Le verdict pour une action donnée, sans le lever. */
  async verdict(userId: string, action: Action): Promise<Verdict> {
    return peut(await this.offreDe(userId), action);
  }

  /**
   * Refuse si l'offre ne couvre pas l'action.
   *
   * Lève une 403 et non une 402 : « Payment Required » suggère qu'un
   * paiement débloque, ce qui est faux quand le quota du mois est épuisé
   * sur la dernière offre. Le corps porte la nuance — quelle offre ouvre,
   * et si attendre suffit — pour que l'interface puisse dire la vérité
   * plutôt que de deviner à partir d'un code.
   */
  async exiger(userId: string, action: Action): Promise<void> {
    const verdict = await this.verdict(userId, action);
    if (verdict.autorise) return;

    throw new ForbiddenException({
      message: verdict.raison,
      offreQuiOuvre: verdict.offreQuiOuvre,
      seRenouvelleLeMoisProchain: verdict.seRenouvelleLeMoisProchain,
    });
  }

  /**
   * Change l'offre d'un compte.
   *
   * `referencePaiement` est ce que le fournisseur renvoie après un
   * encaissement confirmé. Sans lui, seule la gratuite est accessible : on
   * peut toujours redescendre, jamais monter.
   */
  async changer(
    userId: string,
    cible: OffreId,
    referencePaiement?: { fournisseur: string; reference: string },
  ) {
    const fournisseur = this.fournisseurDePaiement();
    const estPayante = prixCentimes(cible) > 0;

    if (estPayante && !referencePaiement) {
      throw new ForbiddenException(
        fournisseur
          ? "Cette offre se souscrit par un paiement, pas par un appel direct : la référence " +
            "de l'encaissement manque."
          : "Aucun moyen de paiement n'est en place pour l'instant, donc aucune offre payante " +
            'ne peut être souscrite. Ignitux préfère le dire plutôt que de te laisser croire ' +
            "que c'est fait.",
      );
    }

    const aujourdHui = new Date();
    return this.prisma.subscriptions.upsert({
      where: { user_id: userId },
      update: {
        offre: cible,
        started_on: aujourdHui,
        ends_on: null,
        provider: referencePaiement?.fournisseur ?? null,
        provider_ref: referencePaiement?.reference ?? null,
      },
      create: {
        user_id: userId,
        offre: cible,
        started_on: aujourdHui,
        provider: referencePaiement?.fournisseur ?? null,
        provider_ref: referencePaiement?.reference ?? null,
      },
    });
  }

  /**
   * Ce qu'on montre sur la page des offres.
   *
   * Le catalogue entier, l'offre en cours, et — quand rien n'encaisse — le
   * fait qu'aucune souscription n'est possible. Afficher trois boutons
   * « Choisir » qui échoueraient tous serait la pire version de cet écran.
   */
  async catalogue(userId: string) {
    const actuelle = await this.offreDe(userId);
    return {
      actuelle,
      souscriptionPossible: this.fournisseurDePaiement() !== null,
      offres: CATALOGUE.map((o) => ({
        ...offre(o.id),
        actuelle: o.id === actuelle,
      })),
      evaluationFinancement: EVALUATION_FINANCEMENT,
    };
  }
}
