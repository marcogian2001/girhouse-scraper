import { Clock, MapPin, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';

/**
 * Opening hours, address, phone, a booking band and the footer.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The contact section content.
 */
export const ContactSection = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const { data } = props;

  return (
    <>
      <div className="grid gap-8 px-6 py-12 md:grid-cols-2 md:px-12">
        {data.openingHours.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-(family-name:--demo-heading) text-lg font-semibold">
              <Clock className="size-5 text-(--demo-primary)" />
              {t('landing_hours')}
            </h4>
            <dl className="divide-y divide-neutral-100 text-sm">
              {data.openingHours.map((row) => (
                <div key={row.day} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-neutral-500 capitalize">{row.day}</dt>
                  <dd className="font-medium">{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="space-y-3 text-sm">
          <h4 className="flex items-center gap-2 font-(family-name:--demo-heading) text-lg font-semibold">
            <MapPin className="size-5 text-(--demo-primary)" />
            {t('landing_contact')}
          </h4>
          {data.directory?.addresses.length ? (
            <ul className="space-y-1">
              {data.directory.addresses.map((address) => (
                <li key={address}>{address}</li>
              ))}
            </ul>
          ) : (
            data.address && <p>{data.address}</p>
          )}
          {data.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-neutral-400" />
              {data.phone}
            </p>
          )}
          <div className="mt-4 space-y-3 rounded-(--demo-radius) bg-(--demo-primary) p-5 text-(--demo-on-primary)">
            <p className="font-(family-name:--demo-heading) font-semibold">
              {t('landing_cta_band', { company: data.company })}
            </p>
            <span className="inline-flex rounded-(--demo-pill) bg-white px-4 py-2 text-xs font-semibold text-neutral-900">
              {data.landing.ctaLabel}
            </span>
          </div>
        </div>
      </div>
      <footer className="border-t border-neutral-100 px-6 py-5 text-center text-xs text-neutral-400">
        {t('landing_footer', { company: data.company })}
      </footer>
    </>
  );
};
