"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  ApiError,
  type SocialAccess,
  type SocialAccount,
  type SocialPost,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PLATEFORMES = ["instagram", "tiktok"] as const;
type Plateforme = (typeof PLATEFORMES)[number];
const NOM: Record<Plateforme, string> = { instagram: "Instagram", tiktok: "TikTok" };

export default function ReseauxSociauxPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const [acces, setAcces] = useState<SocialAccess | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [platform, setPlatform] = useState<Plateforme>("instagram");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [brief, setBrief] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [privacyOptions, setPrivacyOptions] = useState<string[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [creatorNickname, setCreatorNickname] = useState("");
  const [commentDisabled, setCommentDisabled] = useState(false);
  const [duetDisabled, setDuetDisabled] = useState(false);
  const [stitchDisabled, setStitchDisabled] = useState(false);
  const [maxVideoDuration, setMaxVideoDuration] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>();
  const [allowComments, setAllowComments] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercialDisclosure, setCommercialDisclosure] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [confirmedTikTokPosts, setConfirmedTikTokPosts] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [o, a, p] = await Promise.all([
        api.getSocialAccess(token),
        api.listSocialAccounts(token),
        api.listSocialPosts(token),
      ]);
      setAcces(o);
      setAccounts(a);
      setPosts(p);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de charger les publications.",
      );
    }
  }, [token]);

  useEffect(() => {
    if (isReady && !token) router.replace("/login");
    if (!isReady || !token) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("etat") === "ok")
      setNotice(
        "Compte connecté. Tu peux préparer ta première publication.",
      );
    if (params.get("connexion") === "refusee")
      setNotice("La connexion au réseau a été annulée.");
    if (params.get("connexion") === "erreur")
      setError(
        "La connexion a échoué. Vérifie la configuration de l’application développeur puis réessaie.",
      );
    if (params.has("connexion"))
      window.history.replaceState({}, "", "/reseaux-sociaux");
    void load();
  }, [isReady, token, router, load]);

  useEffect(() => {
    if (
      !token ||
      platform !== "tiktok" ||
      !accounts.some((item) => item.platform === "tiktok")
    ) {
      setPrivacyOptions([]);
      setPrivacyLevel("");
      setCreatorNickname("");
      setMaxVideoDuration(null);
      return;
    }
    api
      .getTikTokPrivacyOptions(token)
      .then((options) => {
        setPrivacyOptions(options.privacyLevels);
        setPrivacyLevel((current) =>
          options.privacyLevels.includes(current) ? current : "",
        );
        setCreatorNickname(options.creatorNickname);
        setCommentDisabled(options.commentDisabled);
        setDuetDisabled(options.duetDisabled);
        setStitchDisabled(options.stitchDisabled);
        setMaxVideoDuration(options.maxVideoPostDurationSec);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Impossible de charger les options TikTok.",
        ),
      );
  }, [token, platform, accounts]);

  if (!isReady || !token) return null;

  async function connect(accountPlatform: Plateforme) {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.startSocialConnection(token!, accountPlatform);
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de démarrer la connexion.",
      );
      setBusy(false);
    }
  }

  async function disconnect(accountPlatform: Plateforme) {
    if (!window.confirm(`Déconnecter le compte ${accountPlatform} d’Ignitux ?`))
      return;
    setError(null);
    try {
      await api.disconnectSocialAccount(token!, accountPlatform);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de déconnecter le compte.",
      );
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.createSocialPost(token!, {
        platform,
        caption,
        mediaUrl,
        mediaType,
        privacyLevel: platform === "tiktok" ? privacyLevel : undefined,
        allowComments,
        allowDuet,
        allowStitch,
        brandOrganic,
        brandContent,
        mediaDurationSeconds:
          mediaType === "video" ? durationSeconds : undefined,
      });
      setCaption("");
      setMediaUrl("");
      setDurationSeconds(undefined);
      setAllowComments(false);
      setAllowDuet(false);
      setAllowStitch(false);
      setCommercialDisclosure(false);
      setBrandOrganic(false);
      setBrandContent(false);
      setNotice(
        "Brouillon enregistré. Il ne partira qu’après ton clic sur « Publier maintenant ».",
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible d’enregistrer ce brouillon.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function suggestCaption() {
    setError(null);
    setNotice(null);
    setSuggesting(true);
    try {
      const result = await api.suggestSocialCaption(token!, platform, brief);
      setCaption(result.caption);
      setNotice("IGINI a préparé une proposition. Relis-la et modifie-la avant de l’enregistrer.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "IGINI n’a pas pu préparer cette proposition.");
    } finally {
      setSuggesting(false);
    }
  }

  async function publish(post: SocialPost) {
    if (post.platform === "tiktok" && !confirmedTikTokPosts[post.id]) return;
    if (
      !window.confirm(
        `Publier maintenant sur ${NOM[post.platform]} ? La publication sera visible sur ton compte.`,
      )
    )
      return;
    setError(null);
    try {
      await api.publishSocialPost(token!, post.id, post.platform === "tiktok");
      const envoye = await api.listSocialPosts(token!);
      const celuiCi = envoye.find((item) => item.id === post.id);
      setNotice(
        celuiCi?.status === "published"
          ? `Publié sur ${NOM[post.platform]}.`
          : post.platform === "instagram"
            ? "Instagram prépare la vidéo (une à quelques minutes). Touche « Vérifier le statut » pour la publier dès qu’elle est prête."
            : "TikTok traite la publication. Touche « Vérifier le statut » dans un instant.",
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Ignitux n’a pas pu confirmer la publication. Vérifie ton compte avant de recommencer.",
      );
      await load();
    }
  }

  async function refreshStatus(post: SocialPost) {
    setError(null);
    try {
      const updated = await api.refreshSocialPostStatus(token!, post.id);
      if (updated.status === "published")
        setNotice(`${NOM[post.platform]} a confirmé la publication.`);
      else if (updated.status === "failed")
        setError(
          updated.error ||
            `${NOM[post.platform]} signale un échec. Vérifie le compte avant toute nouvelle tentative.`,
        );
      else
        setNotice(
          post.platform === "instagram"
            ? "Instagram prépare encore la vidéo. Vérifie à nouveau dans une minute."
            : "TikTok traite encore la publication. Vérifie à nouveau dans un instant.",
        );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Impossible de vérifier le statut auprès de ${NOM[post.platform]}.`,
      );
    }
  }

  async function remove(post: SocialPost) {
    if (!window.confirm("Supprimer ce brouillon ?")) return;
    try {
      await api.deleteSocialPost(token!, post.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de supprimer ce brouillon.",
      );
    }
  }

  function status(statusValue: SocialPost["status"]) {
    return {
      draft: "Brouillon",
      publishing: "Envoi en cours",
      finalizing: "Envoi en cours",
      published: "Publié",
      failed: "Échec — vérification requise",
    }[statusValue];
  }

  if (acces && !acces.ouvert) {
    return (
      <main className="page page--wide">
        <h1>Réseaux sociaux</h1>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Bientôt : préparer tes publications Instagram et TikTok depuis
            Ignitux, et les envoyer après ta confirmation.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Cette application ouvrira à tous quand Instagram et TikTok auront
            validé Ignitux. Rien n’est publié en ton nom d’ici là.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page page--wide">
      <div className="top-bar">
        <h1>Réseaux sociaux</h1>
      </div>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Prépare tes publications Instagram et TikTok. Ignitux ne publie rien
          tout seul : tu relis le brouillon et tu confirmes chaque envoi.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          L’image ou la vidéo doit déjà être en ligne, à une adresse HTTPS
          publique : Instagram et TikTok vont la chercher eux-mêmes. TikTok exige
          aussi que ce domaine soit vérifié dans son application développeur.
          Instagram demande un compte professionnel ou créateur.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section className="card" aria-labelledby="comptes-sociaux">
        <h2 id="comptes-sociaux">Comptes connectés</h2>
        {PLATEFORMES.map((p) => {
          const account = accounts.find((item) => item.platform === p);
          return (
            <div
              key={p}
              className="top-bar"
              style={{ flexWrap: "wrap", gap: "0.5rem" }}
            >
              <span>
                <strong>{p === "instagram" ? "Instagram" : "TikTok"}</strong>
                {account
                  ? ` — @${account.username || "compte connecté"}`
                  : " — non connecté"}
              </span>
              {account ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void disconnect(p)}
                >
                  Déconnecter
                </button>
              ) : (
                <button
                  className="secondary"
                  type="button"
                  disabled={busy || acces?.[p] === false}
                  onClick={() => void connect(p)}
                >
                  Connecter {NOM[p]}
                </button>
              )}
              {!account && acces?.[p] === false && (
                <span className="muted" style={{ flexBasis: "100%" }}>
                  Pas encore configuré sur le serveur Ignitux (identifiants
                  développeur {NOM[p]} manquants).
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="nouvelle-publication">
        <h2 id="nouvelle-publication">Préparer une publication</h2>
        <form
          onSubmit={(event) => void create(event)}
          style={{ display: "grid", gap: "0.75rem" }}
        >
          <div className="field">
            <label htmlFor="rs-reseau">Réseau</label>
            <select
              id="rs-reseau"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as Plateforme)}
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rs-type">Type de média</label>
            <select
              id="rs-type"
              value={mediaType}
              onChange={(event) =>
                setMediaType(event.target.value as "image" | "video")
              }
            >
              <option value="image">Image</option>
              <option value="video">
                {platform === "instagram" ? "Vidéo (Reel)" : "Vidéo"}
              </option>
            </select>
          </div>
          {platform === "tiktok" && (
            <>
              {creatorNickname && (
                <p>
                  Compte TikTok : <strong>{creatorNickname}</strong>
                </p>
              )}
              <div className="field">
                <label htmlFor="rs-visibilite">Qui pourra voir cette publication ?</label>
                <select
                  id="rs-visibilite"
                  required
                  value={privacyLevel}
                  onChange={(event) => setPrivacyLevel(event.target.value)}
                >
                  <option value="">Choisir la visibilité</option>
                  {privacyOptions.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={brandContent && option === "SELF_ONLY"}
                    >
                      {(
                        {
                          PUBLIC_TO_EVERYONE: "Tout le monde",
                          MUTUAL_FOLLOW_FRIENDS: "Amis",
                          FOLLOWER_OF_CREATOR: "Abonnés",
                          SELF_ONLY: "Moi uniquement",
                        } as Record<string, string>
                      )[option] ?? option}
                    </option>
                  ))}
                </select>
              </div>
              {mediaType === "video" && maxVideoDuration !== null && (
                <p className="muted">
                  Durée maximale TikTok : {maxVideoDuration} secondes.
                </p>
              )}
              <fieldset style={{ display: "grid", gap: "0.5rem" }}>
                <legend>Interactions (désactivées par défaut)</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={allowComments}
                    disabled={commentDisabled}
                    onChange={(event) => setAllowComments(event.target.checked)}
                  />{" "}
                  Autoriser les commentaires
                  {commentDisabled ? " (désactivés dans TikTok)" : ""}
                </label>
                {mediaType === "video" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={allowDuet}
                        disabled={duetDisabled}
                        onChange={(event) => setAllowDuet(event.target.checked)}
                      />{" "}
                      Autoriser les Duos
                      {duetDisabled ? " (désactivés dans TikTok)" : ""}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={allowStitch}
                        disabled={stitchDisabled}
                        onChange={(event) =>
                          setAllowStitch(event.target.checked)
                        }
                      />{" "}
                      Autoriser les Collages
                      {stitchDisabled ? " (désactivés dans TikTok)" : ""}
                    </label>
                  </>
                )}
              </fieldset>
              <fieldset style={{ display: "grid", gap: "0.5rem" }}>
                <legend>Déclaration de contenu commercial</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={commercialDisclosure}
                    onChange={(event) => {
                      setCommercialDisclosure(event.target.checked);
                      if (!event.target.checked) {
                        setBrandOrganic(false);
                        setBrandContent(false);
                      }
                    }}
                  />{" "}
                  Cette publication fait la promotion d’une entreprise, d’une marque, d’un produit ou d’un service
                </label>
                {commercialDisclosure && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={brandOrganic}
                        onChange={(event) => setBrandOrganic(event.target.checked)}
                      />{" "}
                      Ma marque ou mon entreprise
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={brandContent}
                        onChange={(event) => {
                          setBrandContent(event.target.checked);
                          if (event.target.checked && privacyLevel === "SELF_ONLY") setPrivacyLevel("");
                        }}
                      />{" "}
                      Une autre marque ou un tiers
                    </label>
                    {brandOrganic && <p className="muted">La vidéo ou la photo sera identifiée comme contenu promotionnel.</p>}
                    {brandContent && <p className="muted">La vidéo ou la photo sera identifiée comme partenariat rémunéré. La visibilité « Moi uniquement » n’est pas autorisée.</p>}
                    {!brandOrganic && !brandContent && <p className="error">Choisis ta marque, une autre marque, ou les deux.</p>}
                  </>
                )}
              </fieldset>
            </>
          )}
          <div className="field">
            <label htmlFor="rs-media">Adresse HTTPS publique du média</label>
            <input
              id="rs-media"
              type="url"
              required
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="field">
            <label htmlFor="rs-texte">Texte et hashtags</label>
            <textarea
              id="rs-texte"
              required
              maxLength={2200}
              rows={5}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rs-consignes">Idée ou consignes pour IGINI</label>
            <textarea
              id="rs-consignes"
              rows={3}
              maxLength={1000}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Ex. Présenter Ignitux aux créateurs d’entreprise, ton simple et concret…"
            />
          </div>
          <button type="button" className="secondary" disabled={suggesting || brief.trim().length < 3} onClick={() => void suggestCaption()}>
            {suggesting ? "IGINI prépare le texte…" : "Proposer un texte avec IGINI"}
          </button>
          {mediaUrl && (
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              Aperçu du média : {mediaUrl}
            </p>
          )}
          {mediaType === "image" && mediaUrl && (
            <img
              src={mediaUrl}
              alt="Aperçu de l’image à publier"
              referrerPolicy="no-referrer"
              style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }}
            />
          )}
          {mediaType === "video" && mediaUrl && (
            <video
              src={mediaUrl}
              controls
              preload="metadata"
              onLoadedMetadata={(event) =>
                setDurationSeconds(Math.ceil(event.currentTarget.duration))
              }
              style={{ maxWidth: "100%", maxHeight: 360 }}
            />
          )}
          {mediaType === "video" &&
            durationSeconds &&
            maxVideoDuration !== null &&
            durationSeconds > maxVideoDuration && (
              <p className="error">
                Cette vidéo dépasse la durée maximale autorisée par TikTok.
              </p>
            )}
          <button
            type="submit"
            disabled={
              busy ||
              (platform === "tiktok" && commercialDisclosure && !brandOrganic && !brandContent) ||
              (platform === "tiktok" && brandContent && privacyLevel === "SELF_ONLY") ||
              !accounts.some((item) => item.platform === platform) ||
              (platform === "tiktok" && !privacyLevel) ||
              (platform === "tiktok" &&
                mediaType === "video" &&
                (!durationSeconds ||
                  (maxVideoDuration !== null &&
                    durationSeconds > maxVideoDuration)))
            }
          >
            Enregistrer le brouillon
          </button>
          {!accounts.some((item) => item.platform === platform) && (
            <p className="muted">
              Connecte d’abord ce compte pour créer une publication.
            </p>
          )}
        </form>
      </section>

      <section className="card" aria-labelledby="publications-preparees">
        <h2 id="publications-preparees">Tes publications</h2>
        {posts.length === 0 ? (
          <p className="muted">Aucune publication préparée.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {posts.map((post) => (
              <li
                key={post.id}
                className="card"
                style={{ marginBottom: "0.75rem" }}
              >
                <div className="top-bar">
                  <strong>
                    {post.platform === "instagram" ? "Instagram" : "TikTok"} ·{" "}
                    {status(post.status)}
                  </strong>
                  {post.status === "draft" && post.platform === "tiktok" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(confirmedTikTokPosts[post.id])}
                        onChange={(event) =>
                          setConfirmedTikTokPosts((state) => ({
                            ...state,
                            [post.id]: event.target.checked,
                          }))
                        }
                      />{" "}
                      En publiant, tu acceptes la{" "}
                      <a
                        href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/fr"
                        target="_blank"
                        rel="noreferrer"
                      >
                        confirmation d’utilisation de la musique de TikTok
                      </a>
                      .
                    </label>
                  )}
                  {post.status === "draft" && (
                    <span style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        disabled={
                          post.platform === "tiktok" &&
                          !confirmedTikTokPosts[post.id]
                        }
                        onClick={() => void publish(post)}
                      >
                        Publier maintenant
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void remove(post)}
                      >
                        Supprimer
                      </button>
                    </span>
                  )}
                  {post.status === "publishing" && (
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void refreshStatus(post)}
                      >
                        Vérifier le statut
                      </button>
                    )}
                </div>
                <p>{post.caption}</p>
                <p className="muted" style={{ overflowWrap: "anywhere" }}>
                  {post.media_url}
                </p>
                {post.media_type === "image" ? (
                  <img
                    src={post.media_url}
                    alt="Aperçu du média à publier"
                    referrerPolicy="no-referrer"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 360,
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <video
                    src={post.media_url}
                    controls
                    preload="metadata"
                    style={{ maxWidth: "100%", maxHeight: 360 }}
                  />
                )}
                {post.privacy_level && (
                  <p className="muted">
                    Visibilité TikTok :{" "}
                    {(
                      {
                        PUBLIC_TO_EVERYONE: "Tout le monde",
                        MUTUAL_FOLLOW_FRIENDS: "Amis",
                        FOLLOWER_OF_CREATOR: "Abonnés",
                        SELF_ONLY: "Moi uniquement",
                      } as Record<string, string>
                    )[post.privacy_level] ?? post.privacy_level}
                  </p>
                )}
                {post.error && <p className="error">{post.error}</p>}
                {post.status === "failed" && (
                  <p className="muted">
                    Vérifie d’abord le compte : une erreur réseau peut empêcher
                    Ignitux de savoir si la publication a été reçue.
                  </p>
                )}
                {post.published_at && (
                  <p className="muted">
                    Publié le{" "}
                    {new Date(post.published_at).toLocaleString("fr-FR")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
