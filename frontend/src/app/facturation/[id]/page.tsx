'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type BillingDocument,
  type BillingStatus,
  type BillingType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euros, jour } from '@/lib/montants';

const TYPES: Record<BillingType, string> = {
  devis: 'Devis',
  facture: 'Facture',
  avoir: 'Avoir',
};

const STATUTS: Record<BillingStatus, string> = {
  brouillon: 'Brouillon',
  emis: 'Émis',
  paye: 'Payé',
  annule: 'Annulé',
  refuse: 'Refusé',
};

/** Millièmes d'unité → quantité lisible. 1000 = « 1 », 2500 = « 2,5 ». */
function quantite(milli: number): string {
  return String(milli / 1000).replace('.', ',');
}

/** Points de base → taux de TVA. 2000 = « 20 % », 550 = « 5,5 % ». */
function taux(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} %`;
}

/**
 * UN DOCUMENT, SOUS LA FORME QU'IL AURA CHEZ LE CLIENT.
 *
 * Le module de facturation s'arrêtait une marche avant son but : on pouvait
 * tenir ses devis et ses factures, pas en envoyer une. Un document qui ne
 * sort jamais de l'écran ne sert à rien.
 *
 * Le PDF passe par l'impression du navigateur plutôt que par une
 * bibliothèque embarquée, et c'est un choix. « Enregistrer au format PDF »
 * est dans la boîte d'impression de tous les navigateurs modernes ; générer
 * le PDF nous-mêmes ajouterait des centaines de kilo-octets et une seconde
 * mise en page à tenir à jour — qui finirait par diverger de celle-ci, et
 * c'est alors le document envoyé au client qui serait faux.
 *
 * Les styles d'impression retirent la navigation et les avertissements
 * destinés au porteur : ils n'ont rien à faire sur la feuille qui part.
 */
export default function BillingDocumentPage() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [doc, setDoc] = useState<BillingDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace('/login');
      return;
    }
    api
      .getBillingDocument(token, params.id)
      .then(setDoc)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Document introuvable.'),
      )
      .finally(() => setIsLoading(false));
  }, [isReady, token, router, params.id]);

  if (!isReady || !token) return null;

  return (
    <main className="page document">
      <style>{`
        /* Les marges appartiennent à la feuille, pas à la mise en page :
           sans @page, le contenu colle aux bords et la colonne de droite
           se fait rogner par la zone non imprimable de l'imprimante. */
        @page { margin: 16mm; }

        @media print {
          .sans-impression { display: none !important; }
          /* Le document occupe la largeur utile de la feuille, que @page
             a déjà réduite : lui ajouter une largeur maximale le
             décentrerait. */
          .document { max-width: none; padding: 0; margin: 0; }
          .document .card {
            border: none;
            background: none;
            padding: 0;
            margin: 0 0 1.5rem;
            box-shadow: none;
          }
          /* Le papier est blanc : imprimer le fond sombre du produit
             viderait une cartouche et rendrait le texte illisible. */
          :root, body, .document { background: #fff !important; color: #000 !important; }
          .document .muted { color: #444 !important; }
          .document a { text-decoration: none; color: #000 !important; }
        }
      `}</style>

      <div className="top-bar sans-impression">
        <Link href="/facturation" className="muted">
          ← Retour à la facturation
        </Link>
        {doc && (
          <button className="primary" type="button" onClick={() => window.print()}>
            Imprimer ou enregistrer en PDF
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {isLoading && <p className="loading">Chargement…</p>}

      {doc && (
        <>
          <h1>
            {TYPES[doc.type]} {doc.number}
          </h1>

          <div className="card">
            <div className="top-bar" style={{ marginBottom: '1rem' }}>
              <div>
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  Client
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.1rem' }}>
                  <strong>{doc.client_name}</strong>
                </p>
                {doc.client_details && (
                  <p className="muted" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-line' }}>
                    {doc.client_details}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {doc.issued_at ? 'Émis le' : 'État'}
                </p>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {doc.issued_at ? jour(doc.issued_at) : STATUTS[doc.status]}
                </p>
                {doc.due_at && (
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Échéance : {jour(doc.due_at)}
                  </p>
                )}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0' }}>Désignation</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0' }}>Qté</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0' }}>P.U. HT</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0' }}>TVA</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0' }}>Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((ligne) => (
                    <tr key={ligne.id}>
                      <td style={{ padding: '0.4rem 0' }}>{ligne.label}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '0.4rem 0',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {quantite(ligne.quantity_milli)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '0.4rem 0',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {euros(ligne.unit_price_cents)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '0.4rem 0',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {taux(ligne.vat_rate_basis_points)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '0.4rem 0',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {euros(
                          Math.round((ligne.quantity_milli * ligne.unit_price_cents) / 1000),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                alignItems: 'flex-end',
              }}
            >
              <Total libelle="Total HT" valeur={euros(doc.totals.subtotalCents)} />
              <Total libelle="TVA" valeur={euros(doc.totals.vatCents)} />
              <Total libelle="Total TTC" valeur={euros(doc.totals.totalCents)} fort />
              {doc.status !== 'brouillon' && (
                <Total libelle="Reste dû" valeur={euros(doc.remainingCents)} />
              )}
            </div>

            {doc.notes && (
              <p className="muted" style={{ marginTop: '1.5rem', whiteSpace: 'pre-line' }}>
                {doc.notes}
              </p>
            )}
          </div>

          {doc.status === 'brouillon' && (
            <p className="notice sans-impression">
              <span>
                Ce document est un <strong>brouillon</strong> : il n&apos;a pas encore de valeur
                et son numéro n&apos;est pas définitif. Émets-le depuis la liste avant de
                l&apos;envoyer.
              </span>
            </p>
          )}

          <p className="muted sans-impression" style={{ marginTop: '1.5rem' }}>
            Ignitux ne vérifie ni les mentions obligatoires propres à ton activité, ni ton
            régime de TVA, ni tes obligations de facturation électronique. Avant d&apos;envoyer
            ceci à un client réel, vérifie ces points auprès d&apos;une source officielle ou de
            ton comptable.
          </p>
        </>
      )}
    </main>
  );
}

function Total({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '1.5rem', minWidth: '14rem', justifyContent: 'space-between' }}>
      <span className={fort ? undefined : 'muted'}>{libelle}</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: fort ? 600 : undefined,
          fontSize: fort ? '1.15rem' : undefined,
        }}
      >
        {valeur}
      </span>
    </div>
  );
}
