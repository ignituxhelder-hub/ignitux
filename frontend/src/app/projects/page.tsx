'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RoleBar } from '@/components/role-bar';
import { api, ApiError, type Project, type ProjectJourneySummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoles } from '@/lib/roles';

/**
 * L'ACCUEIL ENTREPRENEUR.
 *
 * Quatre choses, et rien d'autre : qui tu es, tes projets, la prochaine
 * étape de chacun, et un bouton pour en créer un.
 *
 * ## Ce qui a été retiré, et pourquoi
 *
 * Sept liens de navigation s'affichaient ici — Communauté, Marketplace,
 * Relations, Facturation, Consommation IA, Constitution, Mon compte. Ils
 * existent toujours et restent atteignables, mais ils ne peuvent plus être
 * la première chose que voit quelqu'un : demander de choisir entre sept
 * destinations avant même d'avoir un projet, c'est demander de comprendre
 * Ignitux avant de s'en servir.
 *
 * Le formulaire de création était lui aussi déplié en permanence. Replié
 * derrière un bouton, il laisse la place à ce qui compte quand on revient :
 * où en sont les projets déjà là.
 *
 * ## Ce qui n'a pas été retiré
 *
 * Rien. Les outils de travail — CRM, facturation, espace investisseur —
 * gardent toutes leurs actions : ce sont des outils, pas de
 * l'accompagnement, et les appauvrir n'aiderait personne.
 *
 * ## Une application parmi d'autres
 *
 * Cette page a longtemps été le carrefour d'Ignitux : un bouton « Tous mes
 * outils » y menait partout. Ce rôle est passé au bureau (/accueil) et à la
 * barre des tâches (`systeme.tsx`). Ici ne reste que « Mes projets » : on
 * passe d'une application à l'autre par le système, pas par ses voisines.
 */
export default function ProjectsPage() {
  const { token, user, isReady } = useAuth();
  const router = useRouter();
  const { roles, switchTo } = useRoles(token, 'entrepreneur');

  const [projects, setProjects] = useState<Project[]>([]);
  const [parcours, setParcours] = useState<ProjectJourneySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [creation, setCreation] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charger = useCallback(async (jeton: string) => {
    setIsLoading(true);
    setListError(null);
    try {
      const liste = await api.listProjects(jeton);
      setProjects(liste);
      // Le parcours est un confort : s'il échoue, la liste reste utile.
      try {
        setParcours(await api.getMyProjectsJourney(jeton));
      } catch {
        setParcours([]);
      }
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Impossible de charger les projets.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    void charger(token);
  }, [isReady, token, router, charger]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const cree = await api.createProject(token, title, description);
      setTitle('');
      setDescription('');
      setCreation(false);
      // On emmène directement dans le projet : c'est là que le parcours
      // reprend la main, et revenir à une liste après avoir créé serait un
      // détour que personne ne demande.
      router.push(`/projects/${cree.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Impossible de créer le projet.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isReady || !token) return null;

  const etapeDe = (id: string) => parcours.find((p) => p.projectId === id);

  return (
    <main className="page page--wide">
      <RoleBar roles={roles} onSwitch={switchTo} />

      {/* Pas de prenom devine depuis l adresse : « heldersimoes.ge » n est
          pas un prenom, et se tromper de nom en accueillant quelqu un est
          pire que ne pas le nommer. L adresse figure en dessous, en clair,
          pour qui a plusieurs comptes. */}
      <h1 style={{ marginBottom: '0.25rem' }}>Bienvenue sur Ignitux</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: '1.5rem' }}>{user?.email}</p>

      {isLoading && <p className="loading">Chargement…</p>}
      {listError && <p className="error">{listError}</p>}

      {/* Une seule action principale. Le formulaire ne se déplie que si on
          le demande : proposer de créer en même temps qu'on liste, c'est
          offrir deux actions là où une suffit. */}
      {!creation && (
        <button
          className="primary"
          type="button"
          onClick={() => setCreation(true)}
          style={{ marginBottom: '1.5rem' }}
        >
          Créer mon projet
        </button>
      )}

      {creation && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Quelle est ton idée ?</h2>
          {formError && <p className="error">{formError}</p>}
          <div className="field">
            <label htmlFor="title">Nom du projet</label>
            <input
              id="title"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Décris ton idée</label>
            <textarea
              id="description"
              rows={4}
              placeholder="Ce que tu veux faire, et pour qui. Quelques phrases suffisent."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Création…' : 'Commencer'}
            </button>
            <button className="secondary" type="button" onClick={() => setCreation(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {!isLoading && !listError && projects.length === 0 && !creation && (
        <p className="muted">
          Tu n&apos;as pas encore de projet. Commence par décrire ton idée — IGINI s&apos;occupe
          de la suite.
        </p>
      )}

      {projects.length > 0 && (
        <>
          <h2>Mes projets</h2>
          <div className="project-list">
            {projects.map((project) => {
              const etape = etapeDe(project.id);
              return (
                <Link className="project-item" href={`/projects/${project.id}`} key={project.id}>
                  <h3 style={{ marginBottom: '0.25rem' }}>{project.title}</h3>
                  {/* La prochaine étape plutôt que la description : quand on
                      revient, la question n'est pas « c'était quoi ? » mais
                      « j'en étais où ? ». */}
                  {etape?.nextStep ? (
                    <p style={{ margin: 0 }}>
                      <span className="muted" style={{ fontSize: 'var(--texte-etiquette)' }}>
                        {etape.phase} · prochaine étape
                      </span>
                      <br />
                      {etape.nextStep}
                    </p>
                  ) : (
                    project.description && <p style={{ margin: 0 }}>{project.description}</p>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
