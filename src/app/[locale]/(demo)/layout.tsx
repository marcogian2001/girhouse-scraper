import { setRequestLocale } from 'next-intl/server';

export default async function DemoLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  // Always light: the lead sees the business's colours, never the dashboard theme.
  // Clipped sideways, so nothing too wide can uncover the dark page behind it
  return (
    <div className="min-h-svh overflow-x-clip bg-white text-neutral-900 [color-scheme:light]">
      {props.children}
    </div>
  );
}
