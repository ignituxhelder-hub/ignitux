import { describe, expect, it } from 'vitest';
import { APPS_SYSTEME } from './systeme';
import {
  domaineDeLApplication,
  domaineDuChemin,
  envoieEspace,
  libelleRoles,
  ROUTES_PAR_DOMAINE,
  type DomaineEspace,
} from './domaines';

/** Remplace chaque `:param` d'un modèle de route par un identifiant plausible. */
function concret(modele: string): string {
  return modele.replace(/:[A-Za-z]+/g, '3f2b8c1e-0000-4000-8000-000000000001');
}

describe('domaineDuChemin', () => {
  // La table est vérifiée contre les routes @Espace('argent') du serveur
  // par backend/src/equipe/couverture-espaces.spec.ts. Ce test vérifie que
  // CHAQUE modèle se reconnaît lui-même — une faute de frappe le ferait
  // retomber en « personnel », donc sans en-tête, et l'application montrerait
  // les données de la mauvaise personne.
  for (const [domaine, modeles] of Object.entries(ROUTES_PAR_DOMAINE) as [DomaineEspace, readonly string[]][]) {
    it.each(modeles.map((m) => [m]))(`%s → ${domaine}`, (modele) => {
      expect(domaineDuChemin(concret(modele))).toBe(domaine);
    });
  }

  it.each([
    '/billing/documents',
    '/billing/documents/export',
    '/billing/documents/d1/payments',
    '/comptabilite/balance',
    '/comptabilite/ecritures',
    '/banque/comptes/c1/mouvements',
    '/banque/mouvements/m1/rapprochement',
    '/caisse/journees',
  ])('%s → argent', (chemin) => {
    expect(domaineDuChemin(chemin)).toBe('argent');
  });

  it('ignore la chaîne de requête et le fragment', () => {
    expect(domaineDuChemin('/billing/documents?type=facture')).toBe('argent');
    expect(domaineDuChemin('/caisse/journees#haut')).toBe('argent');
  });

  // Tout ce qui n'est pas l'argent : projets (rôles par projet, sans en-tête),
  // opérations, personnel. Le serveur refuserait l'en-tête d'un autre (403).
  it.each([
    '/projects',
    '/projects/p1',
    '/projects/p1/audit-financier',
    '/projects/p1/mon-acces',
    '/projects/p1/collaborators',
    '/agenda',
    '/crm/contacts',
    '/stocks',
    '/vehicules',
    '/immobilier',
    '/publicite',
    '/identite/verifications',
    '/users/me',
    '/users/me/export',
    '/profil',
    '/offres',
    '/me/applications',
    '/espaces',
    '/espaces/entrepreneur',
    '/espaces/investisseur',
    '/chat/messages',
    '/memory',
    '/billing/legal-notice',
  ])('%s → personnel (aucun en-tête)', (chemin) => {
    expect(domaineDuChemin(chemin)).toBe('personnel');
  });

  it('compare le chemin entier, pas un préfixe', () => {
    expect(domaineDuChemin('/billing')).toBe('personnel');
    expect(domaineDuChemin('/billing/documents/d1/inconnu')).toBe('personnel');
    expect(domaineDuChemin('/caisse')).toBe('personnel');
    expect(domaineDuChemin('/caisse/journees/j1')).toBe('personnel');
    expect(domaineDuChemin('/comptabilitex/balance')).toBe('personnel');
  });

  it('un chemin inconnu, vide ou étrange est personnel (jamais d’en-tête)', () => {
    expect(domaineDuChemin('')).toBe('personnel');
    expect(domaineDuChemin('/')).toBe('personnel');
    expect(domaineDuChemin('/nouvelle-route')).toBe('personnel');
    expect(domaineDuChemin('billing/documents')).toBe('personnel');
    expect(domaineDuChemin('https://ailleurs.example/billing/documents')).toBe('personnel');
  });
});

describe('envoieEspace', () => {
  it('seulement pour les routes d’argent', () => {
    expect(envoieEspace('/billing/documents')).toBe(true);
    expect(envoieEspace('/comptabilite/comptes')).toBe(true);
    expect(envoieEspace('/banque/comptes')).toBe(true);
    expect(envoieEspace('/caisse/journees')).toBe(true);
    expect(envoieEspace('/projects')).toBe(false);
    expect(envoieEspace('/agenda')).toBe(false);
    expect(envoieEspace('/users/me')).toBe(false);
    expect(envoieEspace('/espaces')).toBe(false);
  });
});

describe('domaineDeLApplication', () => {
  it('les applications d’argent sont exactement Facturation, Comptabilité, Banque, Caisse', () => {
    const argent = APPS_SYSTEME.filter((a) => domaineDeLApplication(a.id) === 'argent').map((a) => a.id);
    expect(argent.sort()).toEqual(['banque', 'caisse', 'comptabilite', 'facturation']);
  });

  it('toutes les autres restent à la personne', () => {
    for (const app of APPS_SYSTEME) {
      if (['banque', 'caisse', 'comptabilite', 'facturation'].includes(app.id)) continue;
      expect(domaineDeLApplication(app.id)).toBe('personnel');
    }
    expect(domaineDeLApplication('inconnue')).toBe('personnel');
  });
});

describe('libelleRoles', () => {
  it('dit les rôles en clair', () => {
    expect(libelleRoles(['comptable'])).toBe('Comptable');
    expect(libelleRoles(['comptable', 'associe'])).toBe('Comptable et associé');
    expect(libelleRoles([])).toBe('');
  });
});
