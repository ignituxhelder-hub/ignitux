'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  type BoutiqueEnLigneEtat,
  type Project,
  type ShopifyOrder,
  type ShopifyProduct,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function BoutiqueEnLignePage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projets, setProjets] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [isLoadingProjets, setIsLoadingProjets] = useState(true);

  const [etat, setEtat] = useState<BoutiqueEnLigneEtat | null>(null);
  const [produits, setProduits] = useState<ShopifyProduct[]>([]);
  const [commandes, setCommandes] = useState<ShopifyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [shopDomain, setShopDomain] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [forfait, setForfait] = useState('');
  const [prixEuros, setPrixEuros] = useState('');

  useEffect(() => {
    if (isReady && !token) {
      router.replace('/login');
      return;
    }
    if (!token) return;
    setIsLoadingProjets(true);
    api
      .listProjects(token)
      .then((liste) => {
        setProjets(liste);
        const projetRedirection = searchParams.get('projet');
        if (projetRedirection) {
          setProjectId(projetRedirection);
        } else if (liste.length === 1) {
          setProjectId(liste[0].id);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger tes projets.'),
      )
      .finally(() => setIsLoadingProjets(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, router]);

  function charger(id: string) {
    if (!token) return;
    setIsLoading(true);
    api
      .getBoutiqueEnLigneEtat(token, id)
      .then((valeur) => {
        setEtat(valeur);
        if (valeur.connectee) {
          api
            .listerProduitsBoutique(token, id)
            .then(setProduits)
            .catch((err) =>
              setError(
                err instanceof ApiError
                  ? `Produits indisponibles : ${err.message}`
                  : 'Impossible de charger les produits.',
              ),
            );
          api
            .listerCommandesBoutique(token, id)
            .then(setCommandes)
            .catch((err) =>
              setError(
                err instanceof ApiError
                  ? `Commandes indisponibles : ${err.message}`
                  : 'Impossible de charger les commandes.',
              ),
            );
        } else {
          setProduits([]);
          setCommandes([]);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de charger la boutique.'),
      )
      .finally(() => setIsLoading(false));
  }

  // La finalisation d'une connexion Shopify démarrée depuis cette page :
  // le callback backend redirige ici avec le code/shop/state/hmac reçus de
  // Shopify. On les envoie à l'endpoint authentifié /finaliser, qui vérifie
  // que c'est bien nous qui avons démarré cette demande.
  useEffect(() => {
    if (!token || !projectId) return;
    const code = searchParams.get('shopify_code');
    const shop = searchParams.get('shopify_shop');
    const state = searchParams.get('shopify_state');
    const hmac = searchParams.get('shopify_hmac');
    const erreur = searchParams.get('erreur');

    if (erreur) {
      setError('La connexion à Shopify a échoué. Réessaie depuis « Connecter ma boutique ».');
      router.replace(`/boutique-en-ligne?projet=${projectId}`);
      return;
    }

    if (code && shop && state && hmac) {
      setIsFinalizing(true);
      api
        .finaliserConnexionBoutique(token, projectId, { code, shop, state, hmac })
        .then(() => {
          setNotice('Boutique connectée.');
          charger(projectId);
        })
        .catch((err) =>
          setError(
            err instanceof ApiError
              ? `Connexion refusée : ${err.message}`
              : 'La connexion à Shopify a échoué.',
          ),
        )
        .finally(() => {
          setIsFinalizing(false);
          router.replace(`/boutique-en-ligne?projet=${projectId}`);
        });
      return;
    }

    charger(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  if (!isReady || !token) return null;

  async function handleConnecter(e: FormEvent) {
    e.preventDefault();
    if (!token || !projectId || !shopDomain.trim()) return;
    setError(null);
    setIsConnecting(true);
    try {
      const { url } = await api.demarrerConnexionBoutique(token, projectId, shopDomain.trim());
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
      setIsConnecting(false);
    }
  }

  async function handleDeconnecter() {
    if (!token || !projectId) return;
    setError(null);
    setIsDisconnecting(true);
    try {
      await api.deconnecterBoutique(token, projectId);
      setNotice('Boutique déconnectée.');
      charger(projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Déconnexion impossible.');
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleDeclarerForfait(e: FormEvent) {
    e.preventDefault();
    if (!token || !projectId) return;
    const prixCentimes = Math.round(parseFloat(prixEuros.replace(',', '.')) * 100);
    if (!forfait.trim() || !Number.isFinite(prixCentimes) || prixCentimes < 0) return;
    try {
      await api.declarerForfaitBoutique(token, projectId, forfait.trim(), prixCentimes);
      charger(projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible d’enregistrer le forfait.');
    }
  }

  return (
    <div>
      <h1>Boutique en ligne</h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {isFinalizing && <p>Finalisation de la connexion Shopify…</p>}

      {isLoadingProjets && <p>Chargement de tes projets…</p>}

      {!isLoadingProjets && projets.length === 0 && (
        <p>Crée d’abord un projet : une boutique en ligne appartient toujours à un projet.</p>
      )}

      {!isLoadingProjets && projets.length > 1 && (
        <label htmlFor="choix-projet">
          Projet
          <select
            id="choix-projet"
            aria-label="Projet"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {projets.map((projet) => (
              <option key={projet.id} value={projet.id}>
                {projet.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {projectId && isLoading && <p>Chargement…</p>}

      {projectId && !isLoading && etat && !etat.connectee && (
        <form onSubmit={handleConnecter}>
          <p>Aucune boutique connectée pour ce projet.</p>
          <label htmlFor="shop-domain">Domaine Shopify (xxx.myshopify.com)</label>
          <input
            id="shop-domain"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="ma-boutique.myshopify.com"
          />
          <button type="submit" disabled={isConnecting}>
            Connecter ma boutique Shopify
          </button>
        </form>
      )}

      {projectId && !isLoading && etat && etat.connectee && (
        <div>
          <p>{etat.shopDomain}</p>
          <button type="button" onClick={handleDeconnecter} disabled={isDisconnecting}>
            Déconnecter cette boutique
          </button>

          {!etat.forfaitDeclare && (
            <form onSubmit={handleDeclarerForfait}>
              <p>Quel forfait Shopify as-tu choisi ?</p>
              <label htmlFor="forfait">Nom du forfait</label>
              <input id="forfait" value={forfait} onChange={(e) => setForfait(e.target.value)} />
              <label htmlFor="prix">Prix mensuel (€)</label>
              <input id="prix" value={prixEuros} onChange={(e) => setPrixEuros(e.target.value)} />
              <button type="submit">Enregistrer le forfait</button>
            </form>
          )}

          {etat.forfaitDeclare && etat.prixDeclareCentimes !== null && (
            <p>
              Forfait {etat.forfaitDeclare} — {(etat.prixDeclareCentimes / 100).toFixed(2)} € / mois.
              Pense à l’enregistrer dans ta <a href="/comptabilite">comptabilité</a> : Ignitux ne le
              fait jamais à ta place.
            </p>
          )}

          <h2>Produits</h2>
          <ul>
            {produits.map((produit) => (
              <li key={produit.id}>{produit.title}</li>
            ))}
          </ul>

          <h2>Commandes</h2>
          <ul>
            {commandes.map((commande) => (
              <li key={commande.id}>
                {commande.name} — {(commande.totalPriceCents / 100).toFixed(2)} {commande.currency}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
