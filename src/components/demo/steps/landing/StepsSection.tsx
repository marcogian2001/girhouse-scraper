import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { SectionHeading } from './LandingParts';

/**
 * How working with the business goes, as numbered steps joined by a line.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The steps section content.
 */
export const StepsSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const steps = props.data.landing.steps ?? [];

  return (
    <div className="space-y-8 px-6 py-12 md:px-12">
      <SectionHeading kicker={t('landing_steps_kicker')} title={t('landing_steps_title')} />
      <ol className="relative grid gap-6 md:auto-cols-fr md:grid-flow-col">
        <span className="absolute top-5 right-0 left-5 hidden h-0.5 bg-(--demo-accent)/40 md:block" />
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 md:flex-col">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--demo-primary) font-(family-name:--demo-heading) font-bold text-(--demo-on-primary) ring-4 ring-white">
              {index + 1}
            </span>
            <div className="space-y-1">
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm leading-relaxed text-neutral-600">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
