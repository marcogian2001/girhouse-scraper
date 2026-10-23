import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ReplyImportForm } from '@/components/ReplyImportForm';
import { Link } from '@/libs/I18nNavigation';
import { listAccounts } from '@/services/Instantly';

export default async function ReplyImportPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'ReplyImportPage' });
  const accounts = await listAccounts();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard/replies/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('back_link')}
        </Link>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <ReplyImportForm accounts={accounts.map((account) => account.email)} />
    </div>
  );
}
