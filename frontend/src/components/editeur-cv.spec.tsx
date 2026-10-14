import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Cv } from '@/lib/api';
import { cvAEnvoyer, cvEstVide, EditeurCv } from './editeur-cv';

function Hote({ depart }: { depart: Cv }) {
  const [cv, setCv] = useState(depart);
  return (
    <>
      <EditeurCv cv={cv} onChange={setCv} />
      <pre data-testid="etat">{JSON.stringify(cv)}</pre>
    </>
  );
}

const etat = (): Cv => JSON.parse(screen.getByTestId('etat').textContent ?? '{}') as Cv;

describe('EditeurCv', () => {
  it('ajoute une expérience et la remplit', () => {
    render(<Hote depart={{ experiences: [], formations: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter une expérience' }));
    fireEvent.change(screen.getByLabelText('Poste'), { target: { value: 'Chef de rayon' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2015-03' } });
    expect(etat().experiences[0]).toMatchObject({ poste: 'Chef de rayon', debut: '2015-03' });
  });

  it('cache la date de fin pour un poste en cours', () => {
    render(
      <Hote
        depart={{
          experiences: [
            { poste: 'Gérant', entreprise: null, debut: null, fin: null, enCours: false, description: null },
          ],
          formations: [],
        }}
      />,
    );
    expect(screen.getByLabelText('À')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("J'y suis encore"));
    expect(screen.queryByLabelText('À')).not.toBeInTheDocument();
  });

  it('ajoute et retire une formation', () => {
    render(<Hote depart={{ experiences: [], formations: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter une formation' }));
    fireEvent.change(screen.getByLabelText('Diplôme ou formation'), {
      target: { value: 'CAP Coiffure' },
    });
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2012' } });
    expect(etat().formations[0]).toEqual({ diplome: 'CAP Coiffure', etablissement: null, annee: 2012 });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer cette formation' }));
    expect(etat().formations).toEqual([]);
  });

  it('dit que les diplômes ne servent jamais à juger', () => {
    render(<Hote depart={{ experiences: [], formations: [] }} />);
    expect(screen.getByText(/jamais un critère pour te juger/)).toBeInTheDocument();
  });
});

describe('ce qui part au serveur', () => {
  it('retire les fiches laissées vides et la fin d’un poste en cours', () => {
    const cv: Cv = {
      experiences: [
        { poste: '  ', entreprise: null, debut: null, fin: null, enCours: false, description: null },
        { poste: 'Gérant', entreprise: null, debut: '2021-09', fin: '2022-01', enCours: true, description: null },
      ],
      formations: [{ diplome: '', etablissement: null, annee: null }],
    };
    expect(cvAEnvoyer(cv)).toEqual({
      experiences: [
        { poste: 'Gérant', entreprise: null, debut: '2021-09', fin: null, enCours: true, description: null },
      ],
      formations: [],
    });
    expect(cvEstVide({ experiences: cv.experiences.slice(0, 1), formations: cv.formations })).toBe(
      true,
    );
  });
});
