import { useTranslations } from 'next-intl';
import Image from 'next/image';

/**
 * L'HISTOIRE — six étapes, de l'étincelle à un avenir plus grand.
 *
 * Reprise de l'image de référence fournie par Helder pour la direction
 * « Gravure » : six
 * vignettes reliées par un fil de feu. Les images ont été découpées sous leur
 * texte d'origine — figé en français, illisible sur téléphone et fautif
 * (« obstcale ») — et le récit est ici du vrai texte, traduit, au tutoiement
 * comme le reste du site.
 *
 * La liste est ordonnée (`<ol>`) : les numéros dans les pastilles redisent
 * l'ordre pour l'œil, et sont masqués aux lecteurs d'écran qui l'annoncent
 * déjà. Les vignettes sont des décors (`alt=""`).
 */

const ETAPES = ['etincelle', 'doute', 'rencontre', 'construction', 'reussite', 'avenir'] as const;

export function Histoire() {
  const t = useTranslations('accueil.histoire');

  return (
    <section className="section">
      <p className="section-title">{t('titre')}</p>
      <ol className="frise">
        {ETAPES.map((etape, index) => (
          <li key={etape} className="frise__etape">
            <span className="frise__num" aria-hidden="true">
              {index + 1}
            </span>
            <Image
              className="frise__image"
              src={`/images/accueil/histoire-${index + 1}.jpg`}
              width={188}
              height={235}
              alt=""
            />
            <h3 className="frise__nom">{t(`etapes.${etape}.nom`)}</h3>
            <p className="frise__texte">{t(`etapes.${etape}.texte`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
