import { Search, Send, Sparkles } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BrandMark } from '@/components/BrandMark';
import { AppConfig } from '@/utils/AppConfig';

export default async function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'AuthLayout' });

  const features = [
    { icon: Search, label: t('feature_research') },
    { icon: Sparkles, label: t('feature_write') },
    { icon: Send, label: t('feature_send') },
  ];

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-8 p-6 md:p-10">
        <div className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="font-medium">{AppConfig.name}</span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{props.children}</div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand-panel p-12 text-brand-panel-foreground lg:flex lg:flex-col lg:justify-center">
        {/* Cyan bloom lifting the flat brand fill */}
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_15%,oklch(0.72_0.13_209),transparent_65%)] opacity-35" />

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight">{t('brand_title')}</p>
            <p className="text-brand-panel-foreground/90">{t('brand_subtitle')}</p>
          </div>

          <ul className="space-y-4">
            {features.map((feature) => (
              <li key={feature.label} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <feature.icon className="size-4" />
                </span>
                <span className="text-sm text-brand-panel-foreground/90">{feature.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
