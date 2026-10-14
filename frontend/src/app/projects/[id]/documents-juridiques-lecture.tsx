"use client";

import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type CompanyBylaws,
  type DossierCreation,
  type EtatImmatriculation,
} from "@/lib/api";

/**
 * Les documents juridiques vus par un membre de l'équipe (associé, comptable,
 * observateur) : statuts, dossier de création, immatriculation — en lecture
 * seule. Le propriétaire garde les sections complètes ; ici, rien n'écrit,
 * seuls les PDF se téléchargent.
 */
export function DocumentsJuridiquesLecture({
  token,
  projectId,
}: {
  token: string;
  projectId: string;
}) {
  const [statuts, setStatuts] = useState<CompanyBylaws | null | undefined>(undefined);
  const [dossier, setDossier] = useState<DossierCreation | null | undefined>(undefined);
  const [immat, setImmat] = useState<EtatImmatriculation | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    const lire = <T,>(promesse: Promise<T>, poser: (v: T | null) => void) =>
      promesse
        .then((v) => {
          if (!annule) poser(v ?? null);
        })
        .catch(() => {
          if (!annule) poser(null);
        });
    lire(api.getStatuts(token, projectId), (v) => setStatuts(v));
    lire(api.getDossierCreation(token, projectId), (v) => setDossier(v));
    lire(api.getImmatriculation(token, projectId), (v) => setImmat(v));
    return () => {
      annule = true;
    };
  }, [token, projectId]);

  const telecharger = async (
    obtenir: (token: string, projectId: string) => Promise<Blob>,
    nom: string,
  ) => {
    setErreur(null);
    try {
      const blob = await obtenir(token, projectId);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de télécharger le PDF.");
    }
  };

  const date = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR") : "";

  return (
    <section className="card" id="section-documents-juridiques">
      <h2 style={{ marginTop: 0 }}>Documents juridiques</h2>
      <p className="muted">Lecture seule : seul le propriétaire du projet les modifie.</p>
      {erreur && <p className="error">{erreur}</p>}

      <h3>Statuts</h3>
      {statuts === undefined ? (
        <p className="muted">Chargement…</p>
      ) : !statuts?.legal_form ? (
        <p className="muted">Pas encore de statuts.</p>
      ) : (
        <div>
          <p>
            <strong>
              {statuts.status === "retenue" ? "Statuts retenus" : "Statuts en brouillon"}
            </strong>
            {statuts.finalized_at && ` le ${date(statuts.finalized_at)}`} — {statuts.legal_form},
            capital de {(statuts.capital_cents / 100).toLocaleString("fr-FR")} €, siège :{" "}
            {statuts.head_office}
          </p>
          {statuts.associates.length > 0 && (
            <ul>
              {statuts.associates.map((a) => (
                <li key={a.id}>
                  {a.full_name} — {(a.share_basis_points / 100).toLocaleString("fr-FR")} %
                </li>
              ))}
            </ul>
          )}
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: "24rem", overflow: "auto" }}>
            {statuts.content}
          </pre>
          <button
            type="button"
            className="secondary"
            onClick={() => telecharger(api.telechargerStatutsPdf, "statuts.pdf")}
          >
            Télécharger les statuts (PDF)
          </button>
        </div>
      )}

      <h3>Dossier de création</h3>
      {dossier === undefined ? (
        <p className="muted">Chargement…</p>
      ) : !dossier?.filing ? (
        <p className="muted">Dossier indisponible.</p>
      ) : (
        <div>
          <p>
            {dossier.filing.status === "depose" ? (
              <>
                Déposé le {date(dossier.filing.depositedAt)}
                {dossier.filing.filingReference &&
                  ` — référence ${dossier.filing.filingReference}`}
              </>
            ) : (
              "En préparation"
            )}
          </p>
          <ul>
            {dossier.pieces.map((p) => (
              <li key={p.id}>
                {p.titre} —{" "}
                {p.etat === "pret" ? "prêt" : p.etat === "a_faire" ? "à faire" : "non concerné"}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="secondary"
            onClick={() => telecharger(api.telechargerDossierPdf, "dossier-creation.pdf")}
          >
            Télécharger le dossier (PDF)
          </button>
        </div>
      )}

      <h3>Immatriculation</h3>
      {immat === undefined ? (
        <p className="muted">Chargement…</p>
      ) : !immat?.registration ? (
        <p className="muted">Pas encore immatriculée.</p>
      ) : (
        <p>
          {immat.registration.legalName} — SIREN {immat.registration.siren}
          {immat.registration.registeredOn &&
            `, immatriculée le ${date(immat.registration.registeredOn)}`}
          {immat.registration.headOffice && ` — siège : ${immat.registration.headOffice}`}
        </p>
      )}
    </section>
  );
}
