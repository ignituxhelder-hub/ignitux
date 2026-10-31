import { useTranslations } from 'next-intl';

/**
 * L'APERÇU D'UNE ANALYSE — ce qu'IGINI rend, montré sur un projet fictif.
 *
 * Du vrai texte plutôt qu'une capture d'écran : net à toutes les tailles,
 * traduit, et sans image à refaire à chaque retouche de l'interface. La
 * légende dit que le projet est inventé. La forme suit celle d'une vraie
 * analyse (backend/src/igini/analysis/analysis.service.ts) : un résumé, une
 * note de faisabilité sur 10, des points forts, des risques, des prochaines
 * étapes — en plus court.
 */
export function ApercuAnalyse() {
  const t = useTranslations('accueil.apercu');

  return (
    <figure className="card apercu">
      <div className="apercu__tete">
        <p className="apercu__projet">{t('projet')}</p>
        {/* Une note est une mesure : en or, jamais en feu. */}
        <p className="apercu__note">
          <span className="apercu__note-libelle">{t('note')}</span>
          <span className="apercu__note-valeur">7/10</span>
        </p>
      </div>
      <p className="apercu__resume">{t('resume')}</p>
      <div className="apercu__colonnes">
        <div>
          <p className="apercu__libelle">{t('forts')}</p>
          <ul className="accueil-liste">
            <li>{t('fort1')}</li>
            <li>{t('fort2')}</li>
          </ul>
        </div>
        <div>
          <p className="apercu__libelle">{t('risques')}</p>
          <ul className="accueil-liste">
            <li>{t('risque1')}</li>
          </ul>
        </div>
        <div>
          <p className="apercu__libelle">{t('etape')}</p>
          <ul className="accueil-liste">
            <li>{t('etape1')}</li>
          </ul>
        </div>
      </div>
      <figcaption className="apercu__legende">{t('legende')}</figcaption>
    </figure>
  );
}
