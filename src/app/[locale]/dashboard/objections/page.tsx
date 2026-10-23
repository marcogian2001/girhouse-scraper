import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ObjectionForm } from '@/components/ObjectionForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { listObjections } from '@/libs/Objections';

export default async function ObjectionsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'ObjectionsPage' });
  const context = await getApiContext();
  const objections = context ? await listObjections(context.organizationId) : [];
  const toReview = objections.filter((objection) => objection.status === 'needs_review').length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        {toReview > 0 && (
          <p className="text-sm text-warning">{t('to_review', { count: toReview })}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('new_title')}</CardTitle>
            <CardDescription>{t('new_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ObjectionForm />
          </CardContent>
        </Card>

        {objections.map((objection) => (
          <Card key={objection.id}>
            <CardHeader>
              <CardTitle>{objection.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ObjectionForm objection={objection} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
