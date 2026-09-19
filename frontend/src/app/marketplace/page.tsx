'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { IginiMention } from '@/components/igini-mention';
import {
  api,
  ApiError,
  type MarketplaceContact,
  type MarketplaceProfile,
  type MarketplaceRole,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ROLE_LABELS: Record<MarketplaceRole, string> = {
  mentor: 'Mentor',
  investisseur: 'Investisseur',
};

export default function MarketplacePage() {
  const { token, user, isReady } = useAuth();
  const router = useRouter();

  const [profiles, setProfiles] = useState<MarketplaceProfile[]>([]);
  const [ownProfile, setOwnProfile] = useState<MarketplaceProfile | null>(null);
  const [contacts, setContacts] = useState<MarketplaceContact[]>([]);
  const [filterRole, setFilterRole] = useState<MarketplaceRole | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<MarketplaceRole>('mentor');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [contactDrafts, setContactDrafts] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  function load() {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    Promise.all([
      api.listMarketplaceProfiles(token, filterRole || undefined),
      api.getOwnMarketplaceProfile(token),
      api.listReceivedMarketplaceContacts(token),
    ])
      .then(([profileList, own, receivedContacts]) => {
        setProfiles(profileList);
        setOwnProfile(own);
        setContacts(receivedContacts);
        if (own) {
          setRole(own.role);
          setHeadline(own.headline);
          setBio(own.bio ?? '');
          setExpertise(own.expertise.join(', '));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Impossible de charger la marketplace.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, router, filterRole]);

  if (!isReady || !token) {
    return null;
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!token || !headline.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      const expertiseList = expertise
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const saved = await api.upsertMarketplaceProfile(token, role, headline.trim(), bio.trim(), expertiseList);
      setOwnProfile(saved);
      const profileList = await api.listMarketplaceProfiles(token, filterRole || undefined);
      setProfiles(profileList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d\'enregistrer ce profil.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveProfile() {
    if (!token) return;
    setError(null);
    try {
      await api.removeOwnMarketplaceProfile(token);
      setOwnProfile(null);
      setHeadline('');
      setBio('');
      setExpertise('');
      const profileList = await api.listMarketplaceProfiles(token, filterRole || undefined);
      setProfiles(profileList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de retirer ce profil.');
    }
  }

  async function handleContact(profileId: string) {
    if (!token) return;
    const message = (contactDrafts[profileId] ?? '').trim();
    if (!message) return;
    setError(null);
    setSendingTo(profileId);
    try {
      await api.contactMarketplaceProfile(token, profileId, message);
      setContactDrafts((prev) => ({ ...prev, [profileId]: '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d\'envoyer ce message.');
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <Link href="/projects" className="muted">
          ← Retour aux projets
        </Link>
      </div>

      <h1>Mentors et investisseurs</h1>

      <IginiMention style={{ margin: '1.5rem 0' }}>
        te met en relation avec des mentors et des investisseurs — un simple annuaire pour l&apos;instant,
        sans paiement ni gestion de participation : juste un profil et un message pour amorcer le contact.
      </IginiMention>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>{ownProfile ? 'Mon profil' : 'Créer mon profil'}</h2>
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <select aria-label="Rôle" value={role} onChange={(e) => setRole(e.target.value as MarketplaceRole)}>
            <option value="mentor">Mentor</option>
            <option value="investisseur">Investisseur</option>
          </select>
          <input
            aria-label="Titre"
            placeholder="Ex : Mentor produit SaaS B2B"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
          />
          <textarea
            aria-label="Bio"
            rows={3}
            placeholder="Quelques lignes sur ton parcours et ce que tu peux apporter…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <input
            aria-label="Domaines d'expertise"
            placeholder="Domaines d'expertise, séparés par des virgules"
            value={expertise}
            onChange={(e) => setExpertise(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="secondary" type="submit" disabled={isSaving}>
              {isSaving ? 'Enregistrement…' : ownProfile ? 'Mettre à jour' : 'Publier mon profil'}
            </button>
            {ownProfile && (
              <button className="secondary" type="button" onClick={handleRemoveProfile}>
                Retirer mon profil
              </button>
            )}
          </div>
        </form>
      </div>

      {contacts.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Messages reçus</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {contacts.map((contact) => (
              <li key={contact.id} className="project-item" style={{ cursor: 'default', marginBottom: '0.5rem' }}>
                <span className="muted">
                  {contact.from_user?.email} — {new Date(contact.created_at).toLocaleString('fr-FR')}
                </span>
                <p style={{ margin: '0.25rem 0 0' }}>{contact.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="top-bar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Annuaire</h2>
        <select
          aria-label="Filtrer par rôle"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as MarketplaceRole | '')}
        >
          <option value="">Tous</option>
          <option value="mentor">Mentors</option>
          <option value="investisseur">Investisseurs</option>
        </select>
      </div>

      {isLoading && <p className="loading">Chargement…</p>}
      {!isLoading && profiles.length === 0 && <p className="muted">Aucun profil pour l&apos;instant.</p>}

      <div className="project-list">
        {profiles.map((profile) => (
          <div className="project-item" style={{ cursor: 'default' }} key={profile.id}>
            <div className="top-bar">
              <h3 style={{ margin: 0 }}>{profile.headline}</h3>
              <span className="muted">{ROLE_LABELS[profile.role]}</span>
            </div>
            {profile.bio && <p>{profile.bio}</p>}
            {profile.expertise.length > 0 && (
              <p className="muted">{profile.expertise.join(' · ')}</p>
            )}
            {profile.user_id !== user?.id && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  aria-label={`Message pour ${profile.headline}`}
                  placeholder="Votre message…"
                  value={contactDrafts[profile.id] ?? ''}
                  onChange={(e) => setContactDrafts((prev) => ({ ...prev, [profile.id]: e.target.value }))}
                  style={{ flex: 1 }}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={() => handleContact(profile.id)}
                  disabled={sendingTo === profile.id}
                >
                  {sendingTo === profile.id ? 'Envoi…' : 'Contacter'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
