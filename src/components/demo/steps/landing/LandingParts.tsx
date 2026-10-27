import { CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { WhatsAppIcon } from '../../WhatsAppIcon';
import type { DemoPhoto } from '../LandingStep';

/**
 * The kicker and title over a landing section, in the business's heading font.
 * @param props Component props.
 * @param props.kicker The small line over the title.
 * @param props.title The section title.
 * @param props.centered Whether the heading is centred.
 * @returns The section heading.
 */
export const SectionHeading = (props: { kicker: string; title: string; centered?: boolean }) => (
  <div className={props.centered ? 'space-y-1 text-center' : 'space-y-1'}>
    <p className="text-xs font-semibold tracking-widest text-(--demo-primary) uppercase">
      {props.kicker}
    </p>
    <h4 className="font-(family-name:--demo-heading) text-2xl font-bold tracking-tight md:text-3xl">
      {props.title}
    </h4>
  </div>
);

/**
 * The booking and WhatsApp buttons of the hero.
 * @param props Component props.
 * @param props.ctaLabel The booking button's label.
 * @param props.onDark Whether the buttons sit on a photo or the brand colour.
 * @returns The two buttons.
 */
export const HeroButtons = (props: { ctaLabel: string; onDark: boolean }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="flex flex-wrap gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-(--demo-pill) px-5 py-3 text-sm font-semibold shadow ${props.onDark ? 'bg-white text-neutral-900' : 'bg-(--demo-primary) text-(--demo-on-primary)'}`}
      >
        <CalendarCheck className="size-4" />
        {props.ctaLabel}
      </span>
      <span className="inline-flex items-center gap-2 rounded-(--demo-pill) bg-[#25d366] px-5 py-3 text-sm font-semibold text-white shadow">
        <WhatsAppIcon className="size-4" />
        {t('landing_write')}
      </span>
    </div>
  );
};

/**
 * A photo filling its frame, with its author's credit when Google requires one.
 * @param props Component props.
 * @param props.photo The photo.
 * @param props.className Size and shape of the frame.
 * @param props.alt The alternative text, empty for decorative photos.
 * @returns The framed photo.
 */
export const PhotoFrame = (props: { photo: DemoPhoto; className: string; alt?: string }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className={`relative overflow-hidden ${props.className}`}>
      <Image
        src={props.photo.src}
        alt={props.alt ?? ''}
        fill
        unoptimized
        className="object-cover"
      />
      {props.photo.author && (
        <span className="absolute right-2 bottom-1.5 text-[10px] text-white/80 drop-shadow">
          {t('landing_photo_credit', { author: props.photo.author })}
        </span>
      )}
    </div>
  );
};
