import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewOrganizationForm } from '@/components/NewOrganizationForm';

export default async function NewOrganizationPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'NewOrganizationPage' });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <NewOrganizationForm />
    </div>
  );
}
