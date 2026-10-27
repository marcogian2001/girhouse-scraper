import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import type { DemoPhoto } from '../LandingStep';
import { PhotoFrame, SectionHeading } from './LandingParts';

/**
 * Who the business is, next to a photo, with the remaining photos as a strip below.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.photo The photo beside the text, if there is one.
 * @param props.gallery The photos after it.
 * @returns The about section content.
 */
export const AboutSection = (props: {
  data: DemoSnapshot;
  photo: DemoPhoto | undefined;
  gallery: DemoPhoto[];
}) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="space-y-8 px-6 py-12 md:px-12">
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <SectionHeading
            kicker={t('landing_about_kicker')}
            title={t('landing_about_title', { company: props.data.company })}
          />
          <p className="leading-relaxed text-neutral-600">{props.data.landing.about}</p>
        </div>
        {props.photo && (
          <PhotoFrame
            photo={props.photo}
            className="aspect-[4/3] rounded-(--demo-radius) shadow-lg"
          />
        )}
      </div>
      {props.gallery.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
            {t('landing_gallery_title')}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {props.gallery.map((photo) => (
              <PhotoFrame
                key={photo.src}
                photo={photo}
                className="aspect-square rounded-[calc(var(--demo-radius)*0.75)]"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
