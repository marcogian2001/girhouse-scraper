import { setRequestLocale } from 'next-intl/server';
import { BrandMark } from '@/components/BrandMark';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppConfig } from '@/utils/AppConfig';

export default async function PublicLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <BrandMark className="size-6" />
        <span className="font-medium">{AppConfig.name}</span>

        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">{props.children}</main>
    </div>
  );
}
