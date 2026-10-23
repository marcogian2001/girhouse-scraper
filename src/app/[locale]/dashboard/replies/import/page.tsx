import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/PageHeader';
import { ReplyImportForm } from '@/components/ReplyImportForm';

export default async function ReplyImportPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'ReplyImportPage' });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <ReplyImportForm />
    </div>
  );
}
