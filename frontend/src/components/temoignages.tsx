import { useTranslations } from 'next-intl';
import { TEMOIGNAGES, type Temoignage } from '@/lib/temoignages';

/**
 * La section « Témoignages » de l'accueil. Elle ne rend rien tant que la
 * liste est vide : pas de titre au-dessus du vide, et jamais d'exemple
 * inventé pour la remplir (voir lib/temoignages.ts).
 */
export function Temoignages({ temoignages = TEMOIGNAGES }: { temoignages?: readonly Temoignage[] }) {
  const t = useTranslations('accueil.temoignages');
  if (temoignages.length === 0) return null;

  return (
    <section className="section" aria-labelledby="accueil-temoignages">
      <h2 className="section-title" id="accueil-temoignages">
        {t('titre')}
      </h2>
      <ul className="accueil-grille">
        {temoignages.map((temoignage) => (
          <li key={`${temoignage.nom}-${temoignage.accordLe}`} className="card temoignage">
            <blockquote className="temoignage__texte">{temoignage.texte}</blockquote>
            <p className="temoignage__auteur">
              {temoignage.nom} — {temoignage.activite}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
