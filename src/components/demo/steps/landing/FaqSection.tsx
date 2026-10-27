import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { SectionHeading } from './LandingParts';

/**
 * Questions new customers ask, each opening on a tap; the first one starts open.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The questions section content.
 */
export const FaqSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12 md:px-12">
      <SectionHeading kicker={t('landing_faq_kicker')} title={t('landing_faq_title')} centered />
      <div className="divide-y divide-neutral-200 rounded-(--demo-radius) border border-neutral-200 bg-white">
        {props.data.landing.faqs?.map((faq, index) => (
          <details key={faq.question} open={index === 0} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              {faq.question}
              <ChevronDown className="size-4 shrink-0 text-(--demo-primary) transition-transform group-open:rotate-180" />
            </summary>
            <p className="pt-2 text-sm leading-relaxed text-neutral-600">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
};
