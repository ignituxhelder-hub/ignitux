import { contextePersonne, type ProfilLu } from './contexte-personne.js';

const CONDUCTEUR: ProfilLu = {
  display_name: 'Helder',
  activity_country: 'France',
  sectors: ['Transport', 'Industrie'],
  experience: "Conducteur d'engins ferroviaires depuis douze ans.",
  availability: 'Quelques heures par semaine',
  has_founded_before: 'Non',
  skills: ['Technique'],
};

describe('ce qu’IGINI sait de la personne', () => {
  describe('le silence plutôt que le remplissage', () => {
    // « Aucune information disponible » occupe le contexte, se paie en
    // tokens, et pousse le modèle à commenter une absence.
    it('rend null sur un profil absent', () => {
      expect(contextePersonne(null)).toBeNull();
      expect(contextePersonne(undefined)).toBeNull();
    });

    it('rend null sur un profil entièrement vide', () => {
      expect(contextePersonne({})).toBeNull();
      expect(
        contextePersonne({ display_name: '  ', sectors: [], experience: '', skills: [] }),
      ).toBeNull();
    });
  });

  describe('des faits, jamais ce qu’ils impliquent', () => {
    // LA règle du module. « Son expérience terrain réduit les risques » est
    // un jugement : peut-être juste, peut-être faux. S'il doit être posé,
    // c'est au modèle de le poser, avec le droit de conclure l'inverse.
    it('n’énonce aucune conséquence, seulement des déclarations', () => {
      const bloc = contextePersonne(CONDUCTEUR) ?? '';

      for (const mot of ['donc', 'réduit', 'augmente', 'favorise', 'grâce à', 'atout']) {
        expect(bloc.toLowerCase(), mot).not.toContain(mot);
      }
    });

    it('dit explicitement au modèle que c’est à lui de conclure', () => {
      const bloc = contextePersonne(CONDUCTEUR) ?? '';

      expect(bloc).toMatch(/pas des conclusions/);
      expect(bloc).toMatch(/y compris rien/);
    });

    it('rapporte le parcours comme les mots de la personne', () => {
      expect(contextePersonne(CONDUCTEUR)).toMatch(/dans ses mots/);
    });
  });

  describe('ce qu’il rapporte', () => {
    it('nomme les secteurs travaillés et les compétences', () => {
      const bloc = contextePersonne(CONDUCTEUR) ?? '';

      expect(bloc).toContain('Transport, Industrie');
      expect(bloc).toContain('Technique');
    });

    it('nomme le pays, qui change les risques réels', () => {
      expect(contextePersonne(CONDUCTEUR)).toContain('France');
    });

    it('nomme le temps disponible, qui change ce qui est tenable', () => {
      expect(contextePersonne(CONDUCTEUR)).toContain('Quelques heures par semaine');
    });

    // Trois états, pas deux : oui, non, et « pas demandé ». Écrire « n'a
    // jamais créé d'entreprise » sur une absence de réponse serait inventer.
    it('distingue « non » de « pas demandé »', () => {
      expect(contextePersonne({ has_founded_before: 'Non' })).toMatch(/n'a pas encore créé/i);
      expect(contextePersonne({ has_founded_before: 'Oui' })).toMatch(/a déjà créé/i);
      expect(contextePersonne({ has_founded_before: null })).toBeNull();
    });

    // « A porté 1 projet » décrirait celui qu'on est en train d'analyser.
    it('ne compte les projets qu’au-delà du premier', () => {
      expect(contextePersonne(CONDUCTEUR, { projetsPortes: 1 })).not.toMatch(/projets sur Ignitux/);
      expect(contextePersonne(CONDUCTEUR, { projetsPortes: 4 })).toMatch(
        /4 projets sur Ignitux/,
      );
    });

    // Un parcours de trois pages déséquilibrerait le contexte au détriment
    // du projet, qui reste le sujet de l'analyse.
    it('tronque un parcours trop long', () => {
      const bloc = contextePersonne({ experience: 'a'.repeat(900) }) ?? '';

      expect(bloc.length).toBeLessThan(600);
      expect(bloc).toContain('…');
    });
  });

  describe('ce qu’il ne rapporte pas', () => {
    // Le nom sert à s'adresser à la personne, pas à analyser son projet.
    // Le mettre dans le contexte inviterait le modèle à la tutoyer par son
    // prénom dans une analyse, ce qui n'est pas son rôle.
    it('ne transmet pas le nom', () => {
      expect(contextePersonne({ display_name: 'Helder', sectors: ['Transport'] })).not.toContain(
        'Helder',
      );
    });

    it('ignore les listes ne contenant que du vide', () => {
      expect(contextePersonne({ sectors: ['  ', ''], skills: [''] })).toBeNull();
    });
  });
});
