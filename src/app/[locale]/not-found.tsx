import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import { Link } from '@/libs/I18nNavigation';

export default function NotFoundPage() {
  const t = useTranslations('NotFoundPage');

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <BrandMark className="size-10" />

      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">{t('code')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Button asChild className="h-10 px-5">
        <Link href="/dashboard/">{t('button')}</Link>
      </Button>
    </div>
  );
}
