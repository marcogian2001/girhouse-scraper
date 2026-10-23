import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewOrganizationForm } from '@/components/NewOrganizationForm';
import { PageHeader } from '@/components/PageHeader';

export default async function NewOrganizationPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'NewOrganizationPage' });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <NewOrganizationForm />
    </div>
  );
}
