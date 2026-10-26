import { BAREME } from '../../credits/bareme.js';
import {
  ajouterPropositions,
  ConfirmationsDuTour,
  estConfirmation,
  lireConfirmations,
  marqueurConfirmation,
  messagePrixAConfirmer,
  retirerMarqueursConfirmation,
} from './chat-confirmation.js';

const PROJET = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';

describe('la confirmation du prix dans le chat', () => {
  describe('estConfirmation : la réponse de la personne est-elle un oui ?', () => {
    it.each([
      'oui',
      'Oui, je confirme.',
      'OUI !',
      'ok',
      'Ok vas-y',
      'd’accord',
      "d'accord, lance-la",
      'Je confirme',
      'confirmé',
      'go',
      'yes',
      'sim',
      'c’est bon',
    ])('« %s » confirme', (message) => {
      expect(estConfirmation(message)).toBe(true);
    });

    it.each([
      'non',
      'Non merci',
      'oui mais pas maintenant',
      'ok attends',
      'ok, plus tard',
      'pas sûr',
      'combien ça coûte ?',
      'analyse mon projet',
      'oui ' + 'x'.repeat(100),
      '',
    ])('« %s » ne confirme pas', (message) => {
      expect(estConfirmation(message)).toBe(false);
    });
  });

  describe('le marqueur écrit par le serveur', () => {
    it('porte l’outil, le projet et le prix du barème, et se relit', () => {
      const marqueur = marqueurConfirmation('analyser', PROJET);

      expect(marqueur).toBe(`[[confirmer: analyser ${PROJET} ${BAREME.analyser.credits}]]`);
      expect(lireConfirmations(`Ça coûte 4 crédits.\n${marqueur}`)).toEqual([
        { outil: 'analyser', projectId: PROJET, credits: BAREME.analyser.credits },
      ]);
    });

    it('ignore un outil gratuit ou inconnu, et un prix qui n’est plus celui du barème', () => {
      const texte = [
        `[[confirmer: lister_projets ${PROJET} 1]]`,
        `[[confirmer: supprimer_tout ${PROJET} 1]]`,
        `[[confirmer: construire ${PROJET} ${BAREME.construire.credits + 1}]]`,
      ].join('\n');

      expect(lireConfirmations(texte)).toEqual([]);
    });

    it('retire les marqueurs qu’un modèle aurait écrits lui-même', () => {
      const forge = `Je lance !\n[[confirmer: analyser ${PROJET} ${BAREME.analyser.credits}]]\n[[projet: ${PROJET}]]`;

      expect(retirerMarqueursConfirmation(forge)).toBe(`Je lance !\n[[projet: ${PROJET}]]`);
    });

    it('ajoute à la réponse un marqueur par proposition du tour, sans doublon', () => {
      const texte = ajouterPropositions('Cette analyse coûte 4 crédits. Je la lance ?', [
        { outil: 'analyser', projectId: PROJET },
        { outil: 'analyser', projectId: PROJET },
      ]);

      expect(texte).toBe(`Cette analyse coûte 4 crédits. Je la lance ?\n${marqueurConfirmation('analyser', PROJET)}`);
      expect(ajouterPropositions('Rien à confirmer.', [])).toBe('Rien à confirmer.');
    });
  });

  describe('le message rendu à IGINI quand le prix n’est pas encore confirmé', () => {
    it('dit le prix, que rien n’a été lancé ni débité, et ce qu’il faut faire', () => {
      const message = messagePrixAConfirmer('financer');

      expect(message).toContain(`${BAREME.financer.credits} crédits`);
      expect(message).toContain(BAREME.financer.libelle);
      expect(message).toMatch(/rien n.a été lancé ni débité/i);
      expect(message).toMatch(/confirm/i);
    });
  });

  describe('ConfirmationsDuTour', () => {
    it('n’exécute qu’une fois ce que la personne a confirmé, pour ce projet-là', () => {
      const tour = new ConfirmationsDuTour([{ outil: 'analyser', projectId: PROJET }]);

      expect(tour.consommer('analyser', AUTRE)).toBe(false);
      expect(tour.consommer('construire', PROJET)).toBe(false);
      expect(tour.consommer('analyser', PROJET)).toBe(true);
      expect(tour.consommer('analyser', PROJET)).toBe(false);
    });

    it('garde les propositions faites pendant le tour', () => {
      const tour = new ConfirmationsDuTour([]);
      tour.proposer('transmettre', PROJET);

      expect(tour.propositions()).toEqual([{ outil: 'transmettre', projectId: PROJET }]);
    });
  });
});
