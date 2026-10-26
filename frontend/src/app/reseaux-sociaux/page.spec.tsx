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
  error: null,
  published_at: null,
  created_at: "2026-10-25T12:00:00.000Z",
};

describe("RéseauxSociauxPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    signInAs("tok123", { id: "u1", email: "a@b.com" });
    mockApiRoutes({
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
    });
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
      screen.getByRole("checkbox", { name: /Music Usage Confirmation/i }),
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
});
