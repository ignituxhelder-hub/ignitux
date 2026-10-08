'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type FaceDocument } from '@/lib/api';

/**
 * Aperçu d'une face de pièce d'identité pour la revue.
 *
 * L'attribut `src` d'une image ne peut pas porter l'en-tête `Authorization` : on
 * récupère donc les octets avec le jeton, puis on les affiche via une URL
 * `blob:` locale, révoquée dès que l'aperçu disparaît pour ne pas garder la
 * pièce en mémoire plus longtemps que l'écran qui la montre.
 */
export function DocumentApercu({
  token,
  verificationId,
  face,
  libelle,
}: {
  token: string;
  verificationId: string;
  face: FaceDocument;
  libelle: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    let urlObjet: string | null = null;
    setUrl(null);
    setErreur(null);

    api
      .getDocumentVerification(token, verificationId, face)
      .then((blob) => {
        if (annule) return;
        urlObjet = URL.createObjectURL(blob);
        setUrl(urlObjet);
      })
      .catch((err: unknown) => {
        if (annule) return;
        setErreur(err instanceof ApiError ? err.message : 'Document indisponible.');
      });

    return () => {
      annule = true;
      if (urlObjet) URL.revokeObjectURL(urlObjet);
    };
  }, [token, verificationId, face]);

  if (erreur) {
    return (
      <p className="error">
        {libelle} : {erreur}
      </p>
    );
  }
  if (!url) return <p className="loading">Chargement : {libelle.toLowerCase()}…</p>;

  return (
    <figure className="apercu-document">
      {/* next/image ne sait pas servir une URL blob: locale ; une simple img suffit. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={libelle} />
      <figcaption className="muted">{libelle}</figcaption>
    </figure>
  );
}
