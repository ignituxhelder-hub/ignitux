import { contexteProjet } from './contexte-projet.js';

const REPONSES = {
  nature: 'Nouvelle entreprise à créer',
  stade: 'Je prépare le lancement',
  offre: 'Des produits',
  vente: ['En ligne', 'Sur les marchés ou les salons'],
  associes: 'Avec 1 associé',
  patrimoine: 'Oui',
  budget: 'Je ne sais pas encore',
};

describe('ce qu’IGINI sait du projet par le questionnaire', () => {
  it('rend null quand rien n’a été répondu', () => {
    expect(contexteProjet({ reponses: {} })).toBeNull();
    expect(contexteProjet({ reponses: {}, secteur: null, questionsIgini: [] })).toBeNull();
  });

  it('rapporte chaque réponse sous son libellé', () => {
    const texte = contexteProjet({ reponses: REPONSES, secteur: 'Commerce' }) ?? '';
    expect(texte).toContain('- Associés : Avec 1 associé.');
    expect(texte).toContain('- Façon de vendre : En ligne, Sur les marchés ou les salons.');
    expect(texte).toContain('- Secteur : Commerce.');
  });

  it('rapporte « je ne sais pas encore » comme une réponse', () => {
    const texte = contexteProjet({ reponses: REPONSES }) ?? '';
    expect(texte).toContain('Budget de démarrage : Je ne sais pas encore.');
    expect(texte).toContain('« je ne sais pas encore » est une réponse');
  });

  it('n’énonce aucune conséquence', () => {
    const texte = contexteProjet({ reponses: REPONSES, secteur: 'Commerce' }) ?? '';
    for (const mot of ['donc', 'réduit', 'augmente', 'favorise', 'grâce à', 'atout']) {
      expect(texte).not.toContain(mot);
    }
  });

  it('ne lit pas une réponse à une question devenue invisible', () => {
    const texte =
      contexteProjet({
        reponses: { nature: 'Nouvelle entreprise à créer', forme_existante: 'SARL' },
      }) ?? '';
    expect(texte).not.toContain('SARL');
  });

  it('rapporte les réponses aux questions d’IGINI, et seulement celles répondues', () => {
    const texte =
      contexteProjet({
        reponses: {},
        questionsIgini: [
          { question: 'Où sera le camion ?', reponse: 'Sur le marché de Villeurbanne.' },
          { question: 'As-tu un fournisseur ?', reponse: null },
        ],
      }) ?? '';
    expect(texte).toContain('« Où sera le camion ? »');
    expect(texte).toContain('Sur le marché de Villeurbanne.');
    expect(texte).not.toContain('fournisseur');
  });
});
