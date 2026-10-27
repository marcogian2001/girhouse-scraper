import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';

/**
 * Why customers pick the business, as a band in its colour.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The highlights section content.
 */
export const HighlightsSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="space-y-8 bg-(--demo-primary) px-6 py-12 text-(--demo-on-primary) md:px-12">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-widest uppercase opacity-75">
          {t('landing_highlights_kicker')}
        </p>
        <h4 className="font-(family-name:--demo-heading) text-2xl font-bold tracking-tight md:text-3xl">
          {t('landing_highlights_title', { company: props.data.company })}
        </h4>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {props.data.landing.highlights?.map((highlight) => (
          <div
            key={highlight.title}
            className="flex gap-4 rounded-(--demo-radius) bg-white/10 p-5 ring-1 ring-white/15"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--demo-accent) text-white shadow ring-2 ring-white/30">
              <Check className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold">{highlight.title}</p>
              <p className="text-sm leading-relaxed opacity-80">{highlight.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
