import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ObjectionForm } from '@/components/ObjectionForm';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
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
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          toReview > 0 && (
            <Badge variant="ghost" className="bg-warning/10 text-warning">
              {t('to_review', { count: toReview })}
            </Badge>
          )
        }
      />

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
