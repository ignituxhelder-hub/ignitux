import { describe, expect, it } from 'vitest';
import { calculerPieces, piecesCochablesPourForme, type SourcesPieces } from './pieces.js';

const sources = (surcharge: Partial<SourcesPieces> = {}): SourcesPieces => ({
  forme: 'SASU',
  statuts: null,
  identites: [],
  mandatActifSigne: false,
  piecesCochees: [],
  ...surcharge,
});

const etats = (s: SourcesPieces) => Object.fromEntries(calculerPieces(s).map((p) => [p.id, p.etat]));
const piece = (s: SourcesPieces, id: string) => calculerPieces(s).find((p) => p.id === id)!;

describe('calculerPieces', () => {
  it('forme non confirmée : seulement forme_confirmee à faire, sans erreur', () => {
    const pieces = calculerPieces(sources({ forme: null, statuts: { status: 'retenue' }, piecesCochees: ['capital_depose'] }));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ id: 'forme_confirmee', etat: 'a_faire', cochable: false });
  });

  it('forme inconnue : traitée comme non confirmée', () => {
    expect(calculerPieces(sources({ forme: 'SCI' }))).toEqual([expect.objectContaining({ id: 'forme_confirmee', etat: 'a_faire' })]);
  });

  it('société : sept pièces dans l’ordre, forme prête', () => {
    expect(calculerPieces(sources()).map((p) => p.id)).toEqual([
      'forme_confirmee',
      'statuts',
      'identite',
      'mandat',
      'justificatif_siege',
      'capital_depose',
      'declaration_beneficiaires',
    ]);
    expect(piece(sources(), 'forme_confirmee').etat).toBe('pret');
  });

  it.each(['micro-entreprise', 'EI'])('%s : statuts, capital et bénéficiaires non concernés', (forme) => {
    const e = etats(sources({ forme, statuts: { status: 'retenue' }, piecesCochees: ['capital_depose', 'declaration_beneficiaires'] }));
    expect(e).toMatchObject({
      forme_confirmee: 'pret',
      statuts: 'non_concerne',
      capital_depose: 'non_concerne',
      declaration_beneficiaires: 'non_concerne',
      justificatif_siege: 'a_faire',
    });
    expect(piece(sources({ forme }), 'capital_depose').cochable).toBe(false);
  });

  it.each(['EURL', 'SASU', 'SARL', 'SAS'])('%s : capital et bénéficiaires à faire et cochables', (forme) => {
    const s = sources({ forme });
    expect(etats(s)).toMatchObject({ capital_depose: 'a_faire', declaration_beneficiaires: 'a_faire' });
    expect(piece(s, 'capital_depose').cochable).toBe(true);
  });

  it('statuts absents : à faire', () => {
    expect(piece(sources({ statuts: null }), 'statuts').etat).toBe('a_faire');
  });

  it('statuts en brouillon (pas retenus) : à faire, avec un détail qui le dit', () => {
    const p = piece(sources({ statuts: { status: 'brouillon' } }), 'statuts');
    expect(p.etat).toBe('a_faire');
    expect(p.detail).toMatch(/brouillon/);
  });

  it('statuts retenus : prêts', () => {
    expect(piece(sources({ statuts: { status: 'retenue' } }), 'statuts').etat).toBe('pret');
  });

  it('statuts retenus écrits pour la forme confirmée : prêts', () => {
    expect(piece(sources({ forme: 'SASU', statuts: { status: 'retenue', legalForm: 'SASU' } }), 'statuts').etat).toBe('pret');
  });

  it('statuts retenus écrits pour une autre forme : à faire, avec les deux formes nommées', () => {
    const p = piece(sources({ forme: 'SAS', statuts: { status: 'retenue', legalForm: 'SASU' } }), 'statuts');
    expect(p.etat).toBe('a_faire');
    expect(p.detail).toBe(
      'Tes statuts retenus sont écrits pour une SASU ; ta forme confirmée est SAS : déverrouille-les dans la section Statuts pour les réécrire pour SAS avant le dépôt.',
    );
  });

  it('identité en attente : à faire avec détail', () => {
    const p = piece(sources({ identites: [{ status: 'en_attente' }] }), 'identite');
    expect(p.etat).toBe('a_faire');
    expect(p.detail).toMatch(/attente/);
  });

  it('identité rejetée : à faire avec détail', () => {
    const p = piece(sources({ identites: [{ status: 'rejetee' }] }), 'identite');
    expect(p.etat).toBe('a_faire');
    expect(p.detail).toMatch(/refusée/);
  });

  it('identité absente : à faire', () => {
    expect(piece(sources({ identites: [] }), 'identite').etat).toBe('a_faire');
  });

  it('identité validée : prête, même si une demande plus récente est rejetée', () => {
    expect(piece(sources({ identites: [{ status: 'rejetee' }, { status: 'validee' }] }), 'identite').etat).toBe('pret');
  });

  it('mandat : prêt s’il est actif et signé, sinon non concerné (jamais bloquant)', () => {
    expect(piece(sources({ mandatActifSigne: true }), 'mandat').etat).toBe('pret');
    expect(piece(sources({ mandatActifSigne: false }), 'mandat').etat).toBe('non_concerne');
  });

  it('justificatif de siège : à faire tant qu’il n’est pas coché, prêt une fois coché', () => {
    expect(piece(sources(), 'justificatif_siege')).toMatchObject({ etat: 'a_faire', cochable: true });
    expect(piece(sources({ piecesCochees: ['justificatif_siege'] }), 'justificatif_siege').etat).toBe('pret');
  });

  it('pièces cochées : prêtes, les autres restent à faire', () => {
    const e = etats(sources({ piecesCochees: ['capital_depose'] }));
    expect(e.capital_depose).toBe('pret');
    expect(e.declaration_beneficiaires).toBe('a_faire');
  });

  it('chaque pièce a un titre et un détail non vides', () => {
    for (const p of calculerPieces(sources())) {
      expect(p.titre.length).toBeGreaterThan(0);
      expect(p.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('piecesCochablesPourForme', () => {
  it('société : les trois pièces manuelles', () => {
    expect(piecesCochablesPourForme('SAS')).toEqual(['justificatif_siege', 'capital_depose', 'declaration_beneficiaires']);
  });

  it('micro-entreprise / EI : le justificatif de siège seulement', () => {
    expect(piecesCochablesPourForme('micro-entreprise')).toEqual(['justificatif_siege']);
    expect(piecesCochablesPourForme('EI')).toEqual(['justificatif_siege']);
  });

  it('sans forme : aucune', () => {
    expect(piecesCochablesPourForme(null)).toEqual([]);
  });
});
