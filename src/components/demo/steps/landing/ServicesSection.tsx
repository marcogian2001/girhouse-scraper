import { CalendarCheck, Clock, HeartPulse, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { SectionHeading } from './LandingParts';

type Services = DemoSnapshot['landing']['services'];

const SERVICE_ICONS = [HeartPulse, Sparkles, ShieldCheck, CalendarCheck, Star, Clock];

/**
 * The services as cards with an icon each.
 * @param props Component props.
 * @param props.services The services.
 * @returns The cards.
 */
const ServiceCards = (props: { services: Services }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {props.services.map((service, index) => {
      const Icon = SERVICE_ICONS[index % SERVICE_ICONS.length] ?? Sparkles;

      return (
        <div
          key={service.name}
          className="space-y-2 rounded-(--demo-radius) border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-(--demo-accent)/15 text-(--demo-primary)">
            <Icon className="size-5" />
          </span>
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{service.name}</p>
            {service.price && (
              <span className="shrink-0 rounded-full bg-(--demo-primary)/10 px-2.5 py-0.5 text-xs font-semibold text-(--demo-primary)">
                {service.price}
              </span>
            )}
          </div>
          {service.description && (
            <p className="text-sm leading-relaxed text-neutral-600">{service.description}</p>
          )}
        </div>
      );
    })}
  </div>
);

/**
 * The services as a menu, each price at the end of a dotted line.
 * @param props Component props.
 * @param props.services The services.
 * @returns The list.
 */
const ServiceList = (props: { services: Services }) => (
  <ul className="grid gap-x-10 md:grid-cols-2">
    {props.services.map((service) => (
      <li key={service.name} className="space-y-1 border-b border-neutral-200 py-4">
        <div className="flex items-baseline gap-3">
          <p className="font-(family-name:--demo-heading) text-lg font-semibold">{service.name}</p>
          <span className="flex-1 border-b border-dotted border-neutral-300" />
          {service.price && (
            <span className="shrink-0 font-semibold text-(--demo-primary)">{service.price}</span>
          )}
        </div>
        {service.description && (
          <p className="text-sm leading-relaxed text-neutral-600">{service.description}</p>
        )}
      </li>
    ))}
  </ul>
);

/**
 * The services numbered in large figures, like a sequence of treatments.
 * @param props Component props.
 * @param props.services The services.
 * @returns The numbered grid.
 */
const ServiceNumbers = (props: { services: Services }) => (
  <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
    {props.services.map((service, index) => (
      <div key={service.name} className="flex gap-4">
        <span className="font-(family-name:--demo-heading) text-4xl leading-none font-bold text-(--demo-accent)">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="space-y-1 border-t-2 border-(--demo-primary) pt-2">
          <p className="font-semibold">
            {service.name}
            {service.price && (
              <span className="ml-2 text-sm font-normal text-(--demo-primary)">
                {service.price}
              </span>
            )}
          </p>
          {service.description && (
            <p className="text-sm leading-relaxed text-neutral-600">{service.description}</p>
          )}
        </div>
      </div>
    ))}
  </div>
);

const LAYOUTS = { cards: ServiceCards, list: ServiceList, numbered: ServiceNumbers };

/**
 * The services the business offers, in the layout its design picked.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The services section content.
 */
export const ServicesSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const Layout = LAYOUTS[props.data.design?.services ?? 'cards'];

  return (
    <div className="space-y-6 px-6 py-12 md:px-12">
      <SectionHeading kicker={t('landing_nav_services')} title={t('landing_services_title')} />
      <Layout services={props.data.landing.services} />
    </div>
  );
};
