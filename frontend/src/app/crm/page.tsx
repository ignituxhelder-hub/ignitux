'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type CrmChannel,
  type CrmCompany,
  type CrmContact,
  type CrmKind,
  type CrmPipeline,
  type CrmStage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const STAGE_LABELS: Record<CrmStage, string> = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  qualifie: 'Qualifié',
  proposition: 'Proposition envoyée',
  gagne: 'Gagné',
  perdu: 'Perdu',
};

const KIND_LABELS: Record<CrmKind, string> = {
  prospect: 'Prospect',
  client: 'Client',
  partenaire: 'Partenaire',
  autre: 'Autre',
};

const CHANNEL_LABELS: Record<CrmChannel, string> = {
  appel: 'Appel',
  email: 'E-mail',
  rendez_vous: 'Rendez-vous',
  note: 'Note',
};

const STAGES = Object.keys(STAGE_LABELS) as CrmStage[];

export default function CrmPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [pipeline, setPipeline] = useState<CrmPipeline | null>(null);
  const [selected, setSelected] = useState<CrmContact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | ''>('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<CrmKind>('prospect');
  const [contactCompanyId, setContactCompanyId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [channel, setChannel] = useState<CrmChannel>('appel');
  const [summary, setSummary] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companySector, setCompanySector] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanySector, setEditCompanySector] = useState('');
  const [editCompanyWebsite, setEditCompanyWebsite] = useState('');

  function load() {
    if (!token) return;
    setIsLoading(true);
    Promise.all([
      api.listCrmContacts(token, {
        query: appliedQuery || undefined,
        stage: stageFilter || undefined,
      }),
      api.getCrmPipeline(token),
      api.listCrmCompanies(token),
    ])
      .then(([contactList, pipelineSummary, companyList]) => {
        setContacts(contactList);
        setPipeline(pipelineSummary);
        setCompanies(companyList);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger le CRM.'),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, router, appliedQuery, stageFilter]);

  if (!isReady || !token) {
    return null;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !firstName.trim() || !lastName.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await api.createCrmContact(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        kind,
        companyId: contactCompanyId || undefined,
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      setContactCompanyId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce contact.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateCompany(e: FormEvent) {
    e.preventDefault();
    if (!token || !companyName.trim()) return;
    setError(null);
    setIsSavingCompany(true);
    try {
      await api.createCrmCompany(token, {
        name: companyName.trim(),
        sector: companySector.trim() || undefined,
        website: companyWebsite.trim() || undefined,
      });
      setCompanyName('');
      setCompanySector('');
      setCompanyWebsite('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter cette entreprise.");
    } finally {
      setIsSavingCompany(false);
    }
  }

  function startEditCompany(company: CrmCompany) {
    setEditingCompanyId(company.id);
    setEditCompanyName(company.name);
    setEditCompanySector(company.sector ?? '');
    setEditCompanyWebsite(company.website ?? '');
  }

  async function handleUpdateCompany(companyId: string, e: FormEvent) {
    e.preventDefault();
    if (!token || !editCompanyName.trim()) return;
    setError(null);
    try {
      await api.updateCrmCompany(token, companyId, {
        name: editCompanyName.trim(),
        sector: editCompanySector.trim() || undefined,
        website: editCompanyWebsite.trim() || undefined,
      });
      setEditingCompanyId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de modifier cette entreprise.");
    }
  }

  async function handleDeleteCompany(company: CrmCompany) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteCrmCompany(token, company.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer cette entreprise.');
    }
  }

  async function handleStageChange(contact: CrmContact, stage: CrmStage) {
    if (!token) return;
    setError(null);
    try {
      await api.updateCrmContact(token, contact.id, { stage });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de changer l'étape.");
    }
  }

  async function handleSelect(contact: CrmContact) {
    if (!token) return;
    try {
      setSelected(await api.getCrmContact(token, contact.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger ce contact.');
    }
  }

  async function handleLogInteraction(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected || !summary.trim()) return;
    setError(null);
    try {
      await api.logCrmInteraction(token, selected.id, channel, summary.trim());
      setSummary('');
      setSelected(await api.getCrmContact(token, selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer cet échange.");
    }
  }

  async function handleDelete(contact: CrmContact) {
    if (!token) return;
    setError(null);
    try {
      await api.deleteCrmContact(token, contact.id);
      if (selected?.id === contact.id) setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de supprimer ce contact.');
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Relations</h1>
      </div>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          Ton carnet commercial : prospects, clients, partenaires, et l&apos;historique de ce que
          tu leur as dit. Il est strictement personnel — un collaborateur d&apos;un de tes projets
          n&apos;y a pas accès.
        </p>
        {pipeline && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {pipeline.stages.map((entry) => (
              <div key={entry.stage}>
                <strong>{entry.count}</strong> <span className="muted">{entry.label}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          Ce sont des comptages, pas des prévisions : Ignitux n&apos;affiche aucun chiffre
          d&apos;affaires prévisionnel, faute d&apos;historique de conversion réel sur lequel
          l&apos;appuyer.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Entreprises</h2>
        <form
          onSubmit={handleCreateCompany}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        >
          <input
            aria-label="Nom de l'entreprise"
            placeholder="Nom de l'entreprise"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <input
            aria-label="Secteur d'activité"
            placeholder="Secteur (facultatif)"
            value={companySector}
            onChange={(e) => setCompanySector(e.target.value)}
          />
          <input
            aria-label="Site web de l'entreprise"
            placeholder="Site web (facultatif)"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={isSavingCompany}>
            {isSavingCompany ? 'Ajout…' : 'Ajouter une entreprise'}
          </button>
        </form>

        {companies.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Aucune entreprise enregistrée pour l&apos;instant.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {companies.map((company) => (
              <li
                key={company.id}
                className="project-item"
                style={{ cursor: 'default', marginBottom: '0.5rem' }}
              >
                {editingCompanyId === company.id ? (
                  <form
                    onSubmit={(e) => void handleUpdateCompany(company.id, e)}
                    style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                  >
                    <input
                      aria-label={`Nom de ${company.name}`}
                      value={editCompanyName}
                      onChange={(e) => setEditCompanyName(e.target.value)}
                    />
                    <input
                      aria-label={`Secteur de ${company.name}`}
                      placeholder="Secteur (facultatif)"
                      value={editCompanySector}
                      onChange={(e) => setEditCompanySector(e.target.value)}
                    />
                    <input
                      aria-label={`Site web de ${company.name}`}
                      placeholder="Site web (facultatif)"
                      value={editCompanyWebsite}
                      onChange={(e) => setEditCompanyWebsite(e.target.value)}
                    />
                    <button className="secondary" type="submit">
                      Enregistrer
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setEditingCompanyId(null)}
                    >
                      Annuler
                    </button>
                  </form>
                ) : (
                  <div className="top-bar">
                    <span>
                      <strong>{company.name}</strong>
                      {company.sector && <span className="muted"> — {company.sector}</span>}
                    </span>
                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => startEditCompany(company)}
                      >
                        Modifier
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void handleDeleteCompany(company)}
                      >
                        Supprimer
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Ajouter un contact</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            aria-label="Prénom"
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            aria-label="Nom"
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            aria-label="Adresse e-mail"
            placeholder="E-mail (facultatif)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Type de contact"
            value={kind}
            onChange={(e) => setKind(e.target.value as CrmKind)}
          >
            {(Object.keys(KIND_LABELS) as CrmKind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="Entreprise du contact"
            value={contactCompanyId}
            onChange={(e) => setContactCompanyId(e.target.value)}
          >
            <option value="">Aucune entreprise</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <button className="secondary" type="submit" disabled={isSaving}>
            {isSaving ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="top-bar" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Contacts</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query.trim());
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        >
          <input
            aria-label="Rechercher un contact"
            placeholder="Rechercher (nom, prénom, e-mail)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filtrer par étape"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as CrmStage | '')}
          >
            <option value="">Toutes les étapes</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          <button className="secondary" type="submit">
            Rechercher
          </button>
        </form>

        {isLoading && <p className="loading">Chargement…</p>}
        {!isLoading && contacts.length === 0 && (
          <p className="muted">Aucun contact ne correspond.</p>
        )}

        <ul aria-label="Liste des contacts" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="project-item"
              style={{ cursor: 'default', marginBottom: '0.5rem' }}
            >
              <div className="top-bar" style={{ marginBottom: '0.25rem' }}>
                <strong>
                  {contact.first_name} {contact.last_name}
                </strong>
                <span className="muted">{KIND_LABELS[contact.kind]}</span>
              </div>
              {contact.email && <p className="muted" style={{ margin: 0 }}>{contact.email}</p>}
              {contact.company_id && (
                <p className="muted" style={{ margin: 0 }}>
                  {companies.find((c) => c.id === contact.company_id)?.name ?? 'Entreprise'}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  aria-label={`Étape de ${contact.first_name} ${contact.last_name}`}
                  value={contact.stage}
                  onChange={(e) => void handleStageChange(contact, e.target.value as CrmStage)}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
                <button className="secondary" type="button" onClick={() => void handleSelect(contact)}>
                  Historique
                </button>
                <button className="secondary" type="button" onClick={() => void handleDelete(contact)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="top-bar" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>
              Échanges avec {selected.first_name} {selected.last_name}
            </h2>
            <button className="secondary" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>

          <form onSubmit={handleLogInteraction} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              aria-label="Canal de l'échange"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CrmChannel)}
            >
              {(Object.keys(CHANNEL_LABELS) as CrmChannel[]).map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
            <input
              aria-label="Résumé de l'échange"
              placeholder="Ce qui s'est dit"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={{ flex: '1 1 240px' }}
            />
            <button className="secondary" type="submit">
              Enregistrer
            </button>
          </form>

          {(selected.interactions ?? []).length === 0 ? (
            <p className="muted">Aucun échange enregistré pour l&apos;instant.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0 }}>
              {(selected.interactions ?? []).map((interaction) => (
                <li key={interaction.id} style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">
                    {new Date(interaction.occurred_at).toLocaleString('fr-FR')} —{' '}
                    {CHANNEL_LABELS[interaction.channel]}
                  </span>
                  <p style={{ margin: '0.25rem 0 0' }}>{interaction.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
