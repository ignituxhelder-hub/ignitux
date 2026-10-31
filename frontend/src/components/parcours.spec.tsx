import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JourneyEtapeGuide, JourneyRepere, JourneyView } from '@/lib/api';
import { GuideParcours, Progression, TableauDeBord } from './parcours';

/**
 * LA TUILE QUI CONSTATE UN VIDE DOIT OFFRIR DE LE COMBLER.
 *
 * Trouvé par `scripts/parcours-premier-utilisateur.mjs`, pas en lisant le
 * code : la tuile « Tâches » annonçait « Aucune tâche encore. » et s'arrêtait
 * là. Le bouton pour en ajouter une existait, mais dans une section que la vue
 * simple ne montre pas — donc derrière « Vue avancée », dont le libellé ne
 * l'annonce pas.
 *
 * Ces tests tiennent les deux moitiés de la règle : l'action apparaît quand
 * elle sert, et **seulement** quand elle sert. Une action proposée à quelqu'un
 * qui n'y a pas droit est une porte qui se referme au visage.
 */
function repere(partiel: Partial<JourneyRepere>): JourneyRepere {
  return {
    cle: 'taches',
    label: 'Tâches',
    valeur: null,
    precision: 'Aucune tâche encore.',
    ...partiel,
  };
}

describe('le tableau de bord d’un projet', () => {
  it('offre d’ajouter une tâche quand il n’y en a aucune', () => {
    const surTacheVide = vi.fn();
    render(<TableauDeBord reperes={[repere({})]} surTacheVide={surTacheVide} />);

    const action = screen.getByRole('button', { name: 'Ajouter une tâche' });
    fireEvent.click(action);
    expect(surTacheVide).toHaveBeenCalledTimes(1);
  });

  it('n’offre rien quand des tâches existent déjà', () => {
    // La tuile dit alors « 1/3 » : il n'y a plus de vide à combler, et un
    // bouton de plus ne ferait qu'encombrer un chiffre qu'on vient lire.
    render(
      <TableauDeBord
        reperes={[repere({ valeur: '1/3', precision: '2 en cours.' })]}
        surTacheVide={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
  });

  it('n’offre rien à qui ne peut pas agir', () => {
    // Sans rappel — c'est ainsi que la page traite quelqu'un qui consulte le
    // projet d'un autre. Lui proposer d'ajouter une tâche serait promettre une
    // porte qui se refermera.
    render(<TableauDeBord reperes={[repere({})]} />);

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
    // Le reste de la tuile s'affiche quand même : on retire l'action, pas
    // l'information.
    expect(screen.getByText('Aucune tâche encore.')).toBeTruthy();
  });

  it('ne confond pas la tuile des tâches avec les autres', () => {
    // `valeur === null` arrive aussi pour l'Étincelle d'un projet jamais
    // analysé. Proposer « Ajouter une tâche » sous « Étincelle » serait un
    // contresens, et le genre de bogue qu'une condition trop large produit.
    render(
      <TableauDeBord
        reperes={[
          repere({ cle: 'etincelle', label: 'Étincelle', precision: 'Pas encore analysé.' }),
        ]}
        surTacheVide={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ajouter une tâche' })).toBeNull();
  });
});

describe('la progression du projet', () => {
  it('ne montre pas « Transmettre » tant qu’aucun plan de transmission n’existe', () => {
    render(<Progression phase="construire" />);
    expect(screen.getByText('Découvrir')).toBeInTheDocument();
    expect(screen.getByText('Construire')).toBeInTheDocument();
    expect(screen.queryByText('Transmettre')).not.toBeInTheDocument();
  });

  it('la montre une fois la phase atteinte', () => {
    render(<Progression phase="transmettre" />);
    expect(screen.getByText('Transmettre')).toBeInTheDocument();
  });
});

describe('le guide « Ton parcours »', () => {
  const GUIDE: JourneyEtapeGuide[] = [
    { id: 'decrire', label: 'Décrire ton idée', etat: 'fait' },
    { id: 'analyser', label: 'Analyser ton idée', etat: 'en-cours' },
    { id: 'construire', label: 'Établir ton plan', etat: 'a-venir' },
    { id: 'premieres-taches', label: 'Poser tes premières tâches', etat: 'a-venir' },
    { id: 'avancer-taches', label: 'Avancer tes tâches', etat: 'a-venir' },
    { id: 'developper', label: 'Préparer le développement', etat: 'a-venir' },
    { id: 'transmettre', label: 'Penser la transmission', etat: 'a-venir' },
  ];
  function parcours(partiel: Partial<JourneyView> = {}): JourneyView {
    return {
      phase: 'decouvrir',
      phaseLabel: 'Découvrir',
      reperes: [],
      nextStep: {
        id: 'analyser',
        titre: 'Analyser ton idée',
        pourquoi: "C'est le point de départ.",
        section: 'analyse',
      },
      guide: GUIDE,
      visible: [],
      locked: [],
      ...partiel,
    } as JourneyView;
  }

  it('montre chaque étape avec son état, et celle du moment en avant', () => {
    render(<GuideParcours parcours={parcours()} onAller={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Ton parcours' })).toBeInTheDocument();
    const etapes = screen.getAllByRole('listitem');
    expect(etapes).toHaveLength(7);
    expect(etapes[0]).toHaveAccessibleName('Décrire ton idée, faite');
    expect(etapes[1]).toHaveAttribute('aria-current', 'step');
    expect(etapes[1]).toHaveAccessibleName('Analyser ton idée, en cours');
    expect(etapes[2]).toHaveAccessibleName('Établir ton plan, à venir');
    expect(screen.getByText("C'est le point de départ.")).toBeInTheDocument();
  });

  it('« Y aller » demande l’étape en cours', () => {
    const onAller = vi.fn();
    render(<GuideParcours parcours={parcours()} onAller={onAller} />);
    fireEvent.click(screen.getByRole('button', { name: 'Y aller' }));
    expect(onAller).toHaveBeenCalledWith('analyser');
  });

  it('dit qu’on a fait le tour, sans bouton, quand rien ne reste', () => {
    render(
      <GuideParcours
        parcours={parcours({ nextStep: null, guide: GUIDE.map((e) => ({ ...e, etat: 'fait' })) })}
        onAller={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Tu as fait le tour' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Y aller' })).not.toBeInTheDocument();
  });

  it('ne replie rien quand tout est fait, pour montrer les ✅', () => {
    const { container } = render(
      <GuideParcours
        parcours={parcours({ nextStep: null, guide: GUIDE.map((e) => ({ ...e, etat: 'fait' })) })}
        onAller={() => {}}
      />,
    );
    expect(container.querySelectorAll('.guide-etape--repliee')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Voir tout' })).not.toBeInTheDocument();
  });

  it('résume les étapes faites repliées sur téléphone', () => {
    render(<GuideParcours parcours={parcours()} onAller={() => {}} />);
    expect(screen.getByText('✅ 1 étape faite')).toHaveClass('guide-parcours__resume');
  });

  it('dit ce qui bloque quand l’IA est éteinte', () => {
    render(<GuideParcours parcours={parcours()} iaDisponible={false} onAller={() => {}} />);
    expect(screen.getByText(/IGINI est en pause pour le moment/)).toBeInTheDocument();
  });

  // La transmission ne sert que des années plus tard : le serveur ne la met
  // plus dans le chemin, la personne la demande quand elle en a besoin.
  it('propose discrètement de préparer la transmission', () => {
    const onPreparerTransmission = vi.fn();
    render(
      <GuideParcours
        parcours={parcours()}
        onAller={() => {}}
        onPreparerTransmission={onPreparerTransmission}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard : préparer la transmission' }));
    expect(onPreparerTransmission).toHaveBeenCalledTimes(1);
  });

  it('ne le propose pas quand la page ne le permet pas', () => {
    render(<GuideParcours parcours={parcours()} onAller={() => {}} />);
    expect(
      screen.queryByRole('button', { name: 'Plus tard : préparer la transmission' }),
    ).not.toBeInTheDocument();
  });

  it('replie le reste du chemin derrière « Voir tout »', () => {
    const { container } = render(<GuideParcours parcours={parcours()} onAller={() => {}} />);
    const voirTout = screen.getByRole('button', { name: 'Voir tout' });
    expect(voirTout).toHaveAttribute('aria-expanded', 'false');
    // Sur téléphone, le CSS masque les étapes faites et celles au-delà des
    // deux prochaines : ici Décrire, et les trois dernières.
    expect(container.querySelectorAll('.guide-etape--repliee')).toHaveLength(4);
    fireEvent.click(voirTout);
    expect(screen.getByRole('button', { name: 'Replier' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.guide-parcours--tout')).not.toBeNull();
  });
});
