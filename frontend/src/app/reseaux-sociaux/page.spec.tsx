import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/lib/auth";
import { createRouterMock, mockApiRoutes, signInAs } from "@/test-utils/mocks";
import ReseauxSociauxPage from "./page";

const router = createRouterMock();
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DRAFT = {
  id: "post1",
  owner_id: "u1",
  platform: "tiktok",
  caption: "Texte #Ignitux",
  media_url: "https://cdn.ignitux.com/video.mp4",
  media_type: "video",
  media_duration_seconds: 12,
  privacy_level: "SELF_ONLY",
  allow_comments: false,
  allow_duet: false,
  allow_stitch: false,
  brand_organic: false,
  brand_content: false,
  music_consent_at: null,
  status: "draft",
  platform_post_id: null,
  media_container_id: null,
  error: null,
  published_at: null,
  created_at: "2026-10-25T12:00:00.000Z",
};

/** Le solde et le barème, comme `GET /credits` les rend. */
function credits(solde: number) {
  return {
    "GET /credits": {
      status: 200,
      body: {
        solde,
        historique: [],
        bareme: {
          valeurCreditCentimes: 10,
          bienvenue: 30,
          recharges: [],
          rechargeDisponible: false,
          rechargeMessage: "",
          actions: [
            {
              generateur: "publier_reseaux",
              libelle: "Légende d’une publication (réseaux sociaux)",
              credits: 1,
              par: "action",
            },
          ],
        },
      },
    },
  };
}

let routes: Record<string, { status: number; body: unknown }>;

describe("RéseauxSociauxPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs("tok123", { id: "u1", email: "a@b.com" });
    routes = {
      "GET /reseaux-sociaux/acces": {
        status: 200,
        body: { ouvert: true, instagram: true, tiktok: true },
      },
      "GET /reseaux-sociaux/comptes": {
        status: 200,
        body: [
          {
            id: "a1",
            platform: "tiktok",
            username: "ignitux",
            connected_at: "2026-10-25T12:00:00.000Z",
            token_expires_at: "2026-10-26T12:00:00.000Z",
          },
        ],
      },
      "GET /reseaux-sociaux/publications": { status: 200, body: [DRAFT] },
      "POST /reseaux-sociaux/suggestion": {
        status: 201,
        body: { caption: "Une légende proposée par IGINI." },
      },
      "GET /reseaux-sociaux/tiktok/options": {
        status: 200,
        body: {
          privacyLevels: ["SELF_ONLY"],
          creatorNickname: "Ignitux",
          commentDisabled: false,
          duetDisabled: false,
          stitchDisabled: false,
          maxVideoPostDurationSec: 60,
        },
      },
      "POST /reseaux-sociaux/publications/post1/publier": {
        status: 201,
        body: { ...DRAFT, status: "publishing" },
      },
      ...credits(26),
    };
    mockApiRoutes(routes);
  });

  afterEach(() => vi.restoreAllMocks());

  it("exige un accord TikTok explicite avant d’activer la publication", async () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <AuthProvider>
        <ReseauxSociauxPage />
      </AuthProvider>,
    );

    const button = await screen.findByRole("button", {
      name: "Publier maintenant",
    });
    expect(button).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /utilisation de la musique de TikTok/i }),
    );
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(confirmation).toHaveBeenCalled());
    const request = (
      global.fetch as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find(
      ([url, options]) =>
        String(url).includes("/publications/post1/publier") &&
        options.method === "POST",
    );
    if (!request) throw new Error("La requête de publication est absente.");
    expect(JSON.parse(request[1].body)).toEqual({ musicConsent: true });
  });

  describe("le prix de la légende proposée par IGINI", () => {
    it("est dit sous le bouton, avant de le toucher", async () => {
      render(
        <AuthProvider>
          <ReseauxSociauxPage />
        </AuthProvider>,
      );

      expect(await screen.findByText(/Cette action coûte/)).toHaveTextContent(
        "Cette action coûte 1 crédit — il t’en reste 26.",
      );
    });

    it("sans crédit, le bouton reste éteint et mène aux crédits", async () => {
      mockApiRoutes({ ...routes, ...credits(0) });
      render(
        <AuthProvider>
          <ReseauxSociauxPage />
        </AuthProvider>,
      );

      fireEvent.change(await screen.findByLabelText(/Idée ou consignes pour IGINI/i), {
        target: { value: "Présenter Ignitux en une phrase." },
      });

      expect(await screen.findByText(/Crédits insuffisants/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Proposer un texte avec IGINI/i })).toBeDisabled();
      expect(screen.getByRole("link", { name: "Voir mes crédits" })).toHaveAttribute("href", "/credits");
    });

    it("un refus « crédits insuffisants » du serveur porte le lien vers les crédits", async () => {
      mockApiRoutes({
        ...routes,
        "POST /reseaux-sociaux/suggestion": {
          status: 402,
          body: {
            code: "credits_insuffisants",
            message: "Crédits insuffisants : il te faut 1 crédit, tu en as 0.",
            requis: 1,
            disponible: 0,
          },
        },
      });
      render(
        <AuthProvider>
          <ReseauxSociauxPage />
        </AuthProvider>,
      );

      fireEvent.change(await screen.findByLabelText(/Idée ou consignes pour IGINI/i), {
        target: { value: "Présenter Ignitux en une phrase." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Proposer un texte avec IGINI/i }));

      expect(await screen.findByText(/tu en as 0\./)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Voir mes crédits" })).toHaveAttribute("href", "/credits");
    });
  });

  it("insère la suggestion d’IGINI dans le texte sans publier", async () => {
    render(
      <AuthProvider>
        <ReseauxSociauxPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/Texte et hashtags/i), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(/Idée ou consignes pour IGINI/i), {
      target: { value: "Présenter Ignitux en une phrase." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Proposer un texte avec IGINI/i }));

    expect(await screen.findByDisplayValue("Une légende proposée par IGINI.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/reseaux-sociaux/suggestion"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/publications/post1/publier"),
      expect.anything(),
    );
  });

  it("dit que ce n’est pas encore ouvert, sans rien proposer à publier", async () => {
    mockApiRoutes({
      "GET /reseaux-sociaux/acces": {
        status: 200,
        body: { ouvert: false, instagram: true, tiktok: true },
      },
      "GET /reseaux-sociaux/comptes": { status: 200, body: [] },
      "GET /reseaux-sociaux/publications": { status: 200, body: [] },
    });
    render(
      <AuthProvider>
        <ReseauxSociauxPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/ouvrira à tous quand Instagram et TikTok/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connecter/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Texte et hashtags/i)).not.toBeInTheDocument();
  });

  it("n’offre pas de connexion à un réseau que le serveur ne sait pas joindre", async () => {
    mockApiRoutes({
      "GET /reseaux-sociaux/acces": {
        status: 200,
        body: { ouvert: true, instagram: false, tiktok: true },
      },
      "GET /reseaux-sociaux/comptes": { status: 200, body: [] },
      "GET /reseaux-sociaux/publications": { status: 200, body: [] },
    });
    render(
      <AuthProvider>
        <ReseauxSociauxPage />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Connecter Instagram" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Connecter TikTok" })).toBeEnabled();
    expect(screen.getByText(/identifiants\s+développeur Instagram manquants/i)).toBeInTheDocument();
  });

  it("propose la vidéo (Reel) pour Instagram", async () => {
    render(
      <AuthProvider>
        <ReseauxSociauxPage />
      </AuthProvider>,
    );
    const type = await screen.findByLabelText("Type de média");
    expect(screen.getByLabelText("Réseau")).toHaveValue("instagram");
    expect(type).toContainHTML("Vidéo (Reel)");
  });
});
