'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Brand } from '@/components/ignitux-mark';
import { Icone } from '@/components/icones';
import { InvitationInstallation } from '@/components/invitation-installation';
import {
  api,
  ApiError,
  type ApplicationPrevue,
  type ApplicationVue,
  type ChoixBureau,
  type Lanceur,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoles } from '@/lib/roles';
import { enPages, fermerTache, ICONES_PAR_PAGE } from '@/lib/systeme';

/**
 * LE BUREAU — ce qu'on voit en ouvrant Ignitux.
 *
 * Un écran d'accueil de téléphone : des icônes, une par application, rangées
 * en pages qu'on fait glisser du doigt, avec les points qui disent sur quelle
 * page on est. Sur ordinateur, les mêmes pages, plus larges ; on passe de
 * l'une à l'autre par les points ou les flèches du clavier.
 *
 * Ce qu'il affiche est décidé par le serveur (`activation.ts`) : cette page
 * ne trie rien, ne cache rien d'elle-même, et ne peut donc pas diverger de
 * la règle. Elle ne garde aucune porte non plus : une application absente
 * du bureau reste joignable par son adresse, les droits restent au serveur.
 *
 * La personne range son bureau (enregistré sur son compte, donc le même sur
 * téléphone et sur ordinateur), et IGINI continue d'y proposer ce qui
 * deviendrait utile.
 */

type Icone =
  | { sorte: 'app'; app: ApplicationVue; retirable: boolean }
  | { sorte: 'prevue'; app: ApplicationPrevue }
  | { sorte: 'dossier'; apercu: readonly ApplicationVue[] }
  | { sorte: 'organiser' };

function cleIcone(icone: Icone): string {
  if (icone.sorte === 'organiser') return 'organiser';
  if (icone.sorte === 'dossier') return 'dossier';
  return `${icone.sorte}:${icone.app.id}`;
}

/** 4 × 4 sur téléphone, 6 × 3 sur grand écran — la même règle que la grille CSS. */
function useIconesParPage(): number {
  const [parPage, setParPage] = useState<number>(ICONES_PAR_PAGE.telephone);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const requete = window.matchMedia('(min-width: 640px)');
    const suivre = () =>
      setParPage(requete.matches ? ICONES_PAR_PAGE.ecran : ICONES_PAR_PAGE.telephone);
    suivre();
    requete.addEventListener?.('change', suivre);
    return () => requete.removeEventListener?.('change', suivre);
  }, []);
  return parPage;
}

function Glyphe({ app }: { app: ApplicationVue }) {
  return (
    <span className="icone__glyphe" data-categorie={app.categorie} aria-hidden="true">
      <Icone id={app.id} />
    </span>
  );
}

/** Un aperçu façon iOS : quatre des applications qu'on trouve dans le dossier. */
function ApercuDossier({ apercu }: { apercu: readonly ApplicationVue[] }) {
  return (
    <span className="dossier-apercu">
      {apercu.slice(0, 4).map((app) => (
        <span key={app.id} className="dossier-apercu__case" data-categorie={app.categorie}>
          <Icone id={app.id} />
        </span>
      ))}
    </span>
  );
}

function IconeBureau({
  icone,
  rangement,
  occupe,
  onRetirer,
  onOuvrirDossier,
  onOrganiser,
  onDetail,
}: {
  icone: Icone;
  rangement: boolean;
  occupe: boolean;
  onRetirer: (app: ApplicationVue) => void;
  onOuvrirDossier: () => void;
  onOrganiser: () => void;
  onDetail: (app: ApplicationPrevue) => void;
}) {
  if (icone.sorte === 'organiser') {
    return (
      <button type="button" className="icone icone--organiser" onClick={onOrganiser}>
        <span className="icone__glyphe" aria-hidden="true">
          +
        </span>
        <span className="icone__nom">Organiser mon bureau</span>
      </button>
    );
  }

  // Un dossier, comme sur un téléphone : il regroupe le reste des
  // applications sans les faire disparaître, et s'ouvre en plein écran.
  if (icone.sorte === 'dossier') {
    return (
      <button
        type="button"
        className="icone icone--dossier"
        onClick={onOuvrirDossier}
        aria-label="Ouvrir Entreprise"
      >
        <span className="icone__glyphe icone__glyphe--dossier" aria-hidden="true">
          <ApercuDossier apercu={icone.apercu} />
        </span>
        <span className="icone__nom">Entreprise</span>
      </button>
    );
  }

  // Pensée, pas encore construite : elle se montre, elle ne s'ouvre pas.
  if (icone.sorte === 'prevue') {
    const { app } = icone;
    return (
      <button
        type="button"
        className="icone icone--prevue"
        onClick={() => onDetail(app)}
        aria-label={`${app.nom}, bientôt`}
      >
        <Glyphe app={app} />
        <span className="icone__nom">{app.nom}</span>
        <span className="icone__badge">{app.pourToi ? 'Pour toi' : 'Bientôt'}</span>
      </button>
    );
  }

  const { app } = icone;
  if (!app.route) return null;

  // En rangement, l'icône tremble et ne s'ouvre plus : on ne veut pas ouvrir
  // ce qu'on s'apprêtait à retirer.
  if (rangement) {
    return (
      <div className="icone icone--rangement">
        <Glyphe app={app} />
        <span className="icone__nom">{app.nom}</span>
        {icone.retirable && (
          <button
            type="button"
            className="icone__retirer"
            disabled={occupe}
            onClick={() => onRetirer(app)}
            aria-label={`Retirer ${app.nom} du bureau`}
          >
            <span aria-hidden="true">−</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <Link href={app.route} className="icone" title={app.resume}>
      <Glyphe app={app} />
      <span className="icone__nom">{app.nom}</span>
    </Link>
  );
}

/**
 * Les icônes rangées en pages qu'on fait glisser, avec les points qui disent
 * où on en est. Utilisée deux fois : pour le bureau, et pour ce que montre
 * le dossier Entreprise une fois ouvert — chacune garde sa propre page en
 * cours, glisser dans l'un ne déplace pas l'autre.
 */
function GrillePages({
  icones,
  parPage,
  rangement,
  occupe,
  libellePages,
  onRetirer,
  onOuvrirDossier,
  onOrganiser,
  onDetail,
}: {
  icones: Icone[];
  parPage: number;
  rangement: boolean;
  occupe: boolean;
  libellePages: string;
  onRetirer: (app: ApplicationVue) => void;
  onOuvrirDossier: () => void;
  onOrganiser: () => void;
  onDetail: (app: ApplicationPrevue) => void;
}) {
  const defilement = useRef<HTMLDivElement>(null);
  const [pageActive, setPageActive] = useState(0);
  const pages = enPages(icones, parPage);
  const nbPages = pages.length;

  // Moins de pages qu'avant (on a retiré des icônes) : on ne reste pas sur
  // une page qui n'existe plus.
  useEffect(() => {
    if (pageActive > nbPages - 1) setPageActive(Math.max(0, nbPages - 1));
  }, [nbPages, pageActive]);

  function allerA(page: number) {
    const cible = Math.min(Math.max(page, 0), nbPages - 1);
    setPageActive(cible);
    const zone = defilement.current;
    zone?.scrollTo?.({ left: cible * zone.clientWidth, behavior: 'smooth' });
  }

  function suivreDefilement() {
    const zone = defilement.current;
    if (!zone || zone.clientWidth === 0) return;
    const page = Math.round(zone.scrollLeft / zone.clientWidth);
    if (page !== pageActive) setPageActive(page);
  }

  function clavier(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') allerA(pageActive + 1);
    if (event.key === 'ArrowLeft') allerA(pageActive - 1);
  }

  return (
    <>
      <div
        ref={defilement}
        className="accueil-pages"
        onScroll={suivreDefilement}
        onKeyDown={clavier}
        tabIndex={0}
        aria-label={
          nbPages > 1 ? `${libellePages} — glisse ou utilise les flèches pour changer de page` : 'Icônes'
        }
      >
        {pages.map((page, index) => (
          <ul
            key={index}
            className={`accueil-page${rangement ? ' accueil-page--rangement' : ''}`}
            aria-label={`Page ${index + 1} sur ${nbPages}`}
          >
            {page.map((icone) => (
              <li key={cleIcone(icone)}>
                <IconeBureau
                  icone={icone}
                  rangement={rangement}
                  occupe={occupe}
                  onRetirer={onRetirer}
                  onOuvrirDossier={onOuvrirDossier}
                  onOrganiser={onOrganiser}
                  onDetail={onDetail}
                />
              </li>
            ))}
          </ul>
        ))}
      </div>

      {nbPages > 1 && (
        <div className="accueil-points" role="group" aria-label={libellePages}>
          {pages.map((_, index) => (
            <button
              key={index}
              type="button"
              className="accueil-points__point"
              aria-label={`Page ${index + 1}`}
              aria-current={index === pageActive ? 'true' : undefined}
              onClick={() => allerA(index)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function LanceurPage() {
  const { token, isReady, logout } = useAuth();
  const router = useRouter();
  const { roles } = useRoles(token);
  const parPage = useIconesParPage();

  const [lanceur, setLanceur] = useState<Lanceur | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangement, setRangement] = useState(false);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreurRangement, setErreurRangement] = useState<string | null>(null);
  const [dossierOuvert, setDossierOuvert] = useState(false);
  const [detail, setDetail] = useState<ApplicationPrevue | null>(null);

  async function choisir(app: ApplicationVue, choix: ChoixBureau) {
    if (!token) return;
    setOccupe(app.id);
    setErreurRangement(null);
    try {
      setLanceur(await api.setChoixApplication(token, app.id, choix));
      // Retirée du bureau, elle quitte aussi la barre des tâches.
      if (choix === 'retiree') fermerTache(app.id);
    } catch (err) {
      setErreurRangement(
        err instanceof ApiError ? err.message : "Le bureau n'a pas pu être enregistré.",
      );
    } finally {
      setOccupe(null);
    }
  }

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    let annule = false;
    api
      .getMyApplications(token)
      .then((data) => {
        if (!annule) setLanceur(data);
      })
      .catch((err: unknown) => {
        if (!annule) {
          setError(
            err instanceof ApiError ? err.message : 'Impossible de charger tes applications.',
          );
        }
      });
    return () => {
      annule = true;
    };
  }, [isReady, token, router]);

  // Mes projets reste seul en vue : c'est le point de départ de tout le
  // reste. Le reste des applications, les réglages qui ne sont pas
  // l'identité de la personne (profil, compte), et tout ce qui arrive,
  // vont dans le dossier Entreprise — un écran de téléphone n'affiche pas
  // vingt icônes d'un coup, il les range.
  const appsPrincipales = lanceur ? lanceur.applications.filter((app) => app.id === 'parcours') : [];
  const appsDossier = lanceur ? lanceur.applications.filter((app) => app.id !== 'parcours') : [];
  const reglagesPrincipaux = lanceur
    ? lanceur.reglages.filter((app) => app.id === 'profil' || app.id === 'compte')
    : [];
  const reglagesDossier = lanceur
    ? lanceur.reglages.filter((app) => app.id !== 'profil' && app.id !== 'compte')
    : [];
  const prevuesTriees = lanceur
    ? [...lanceur.prevues].sort((a, b) => Number(b.pourToi) - Number(a.pourToi))
    : [];

  const icones: Icone[] = lanceur
    ? [
        ...appsPrincipales.map((app) => ({ sorte: 'app' as const, app, retirable: true })),
        { sorte: 'dossier' as const, apercu: [...appsDossier, ...reglagesDossier, ...prevuesTriees] },
        ...reglagesPrincipaux.map((app) => ({ sorte: 'app' as const, app, retirable: false })),
        ...(rangement ? [] : [{ sorte: 'organiser' as const }]),
      ]
    : [];

  const iconesDossier: Icone[] = lanceur
    ? [
        ...appsDossier.map((app) => ({ sorte: 'app' as const, app, retirable: true })),
        ...reglagesDossier.map((app) => ({ sorte: 'app' as const, app, retirable: false })),
        ...prevuesTriees.map((app) => ({ sorte: 'prevue' as const, app })),
      ]
    : [];

  if (!isReady || !token) return null;

  const sansRole = roles !== null && Array.isArray(roles.roles) && roles.roles.length === 0;
  const banniereRangement = (
    <div className="notice ecran-accueil__rangement">
      <span>
        Touche <strong>−</strong> pour retirer une icône, rien d&apos;autre : tes factures, contacts
        et projets restent là, et elle revient d&apos;un clic depuis la boutique.
      </span>
      <button
        className="primary"
        type="button"
        style={{ width: 'auto', flex: 'none' }}
        onClick={() => setRangement(false)}
      >
        Terminé
      </button>
    </div>
  );

  return (
    <main className="page page--home ecran-accueil">
      <div className="top-bar">
        <Brand />
        <button
          className="secondary"
          type="button"
          onClick={() => {
            logout();
            router.replace('/login');
          }}
        >
          Se déconnecter
        </button>
      </div>

      {!dossierOuvert && <h1 className="ecran-accueil__titre">Ton bureau</h1>}

      {!dossierOuvert && sansRole && (
        <p className="notice" style={{ marginBottom: '1rem' }}>
          <span>
            Tu n&apos;as pas encore dit qui tu es dans Ignitux : on te montre l&apos;espace
            entrepreneur, comme avant. <Link href="/roles">Choisir mes rôles</Link> ne déplace
            aucune de tes données.
          </span>
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {!lanceur && !error && <p className="loading">Chargement…</p>}

      {lanceur && (
        <>
          {lanceur.suggestions.length > 0 && !rangement && !dossierOuvert && (
            <section aria-labelledby="suggestions-titre" className="widget-igini">
              <h2 id="suggestions-titre" className="launcher-eyebrow">
                <strong style={{ color: 'var(--accent)' }}>IGINI</strong> te propose
              </h2>
              {lanceur.suggestions.map((app) => (
                <div key={app.id} className="widget-igini__ligne">
                  <Glyphe app={app} />
                  <div className="widget-igini__texte">
                    <p className="suggestion__nom">{app.nom}</p>
                    <p className="muted" style={{ margin: 0 }}>
                      {app.raison}
                    </p>
                  </div>
                  {app.route && (
                    <Link className="secondary" href={app.route}>
                      Ouvrir {app.nom}
                    </Link>
                  )}
                </div>
              ))}
            </section>
          )}

          {dossierOuvert ? (
            <>
              <div className="ecran-accueil__entete-dossier">
                <button
                  type="button"
                  className="secondary"
                  style={{ width: 'auto' }}
                  onClick={() => setDossierOuvert(false)}
                >
                  ← Bureau
                </button>
                <h2 className="ecran-accueil__titre">Entreprise</h2>
              </div>

              {rangement && banniereRangement}
              {erreurRangement && <p className="error">{erreurRangement}</p>}

              <section aria-label="Applications du dossier Entreprise" aria-roledescription="dossier">
                <GrillePages
                  icones={iconesDossier}
                  parPage={parPage}
                  rangement={rangement}
                  occupe={occupe !== null}
                  libellePages="Pages du dossier"
                  onRetirer={(app) => void choisir(app, 'retiree')}
                  onOuvrirDossier={() => {}}
                  onOrganiser={() => {
                    setDetail(null);
                    setRangement(true);
                  }}
                  onDetail={setDetail}
                />
              </section>

              {detail && (
                <div className="card detail-prevue" role="status">
                  <div>
                    <p className="suggestion__nom">
                      {detail.nom} — bientôt
                      {detail.pourToi && <span className="pill pill--fire">Pour ton secteur</span>}
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      {detail.resume} Pensée, pas encore construite : elle ne s&apos;ouvrira pas sur
                      un écran vide.
                    </p>
                    {detail.cadre && <p className="upcoming-list__cadre">{detail.cadre}</p>}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 'auto', flex: 'none' }}
                    onClick={() => setDetail(null)}
                  >
                    OK
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {rangement && banniereRangement}
              {erreurRangement && <p className="error">{erreurRangement}</p>}

              <section aria-label="Mes applications" aria-roledescription="bureau">
                <GrillePages
                  icones={icones}
                  parPage={parPage}
                  rangement={rangement}
                  occupe={occupe !== null}
                  libellePages="Pages du bureau"
                  onRetirer={(app) => void choisir(app, 'retiree')}
                  onOuvrirDossier={() => setDossierOuvert(true)}
                  onOrganiser={() => {
                    setDetail(null);
                    setRangement(true);
                  }}
                  onDetail={setDetail}
                />
              </section>

              {rangement && (
                <section aria-labelledby="boutique-titre" className="launcher-section">
                  <h2 id="boutique-titre" className="launcher-eyebrow">
                    Boutique
                  </h2>
                  {lanceur.boutique.length === 0 ? (
                    <p className="muted" style={{ marginTop: 0 }}>
                      Toutes les applications disponibles sont déjà sur ton bureau.
                    </p>
                  ) : (
                    <ul className="boutique-liste" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {lanceur.boutique.map((app) => (
                        <li key={app.id} className="boutique-item">
                          <span className="boutique-item__entete">
                            <Glyphe app={app} />
                            <span className="app-tile__nom">{app.nom}</span>
                          </span>
                          <span className="app-tile__resume">{app.resume}</span>
                          {app.horsOffre && (
                            <span className="upcoming-list__cadre">
                              Pas comprise dans ton offre actuelle.
                            </span>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            disabled={occupe !== null}
                            onClick={() => void choisir(app, 'ajoutee')}
                            aria-label={`Ajouter ${app.nom} au bureau`}
                          >
                            Ajouter au bureau
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <InvitationInstallation />
            </>
          )}
        </>
      )}
    </main>
  );
}
