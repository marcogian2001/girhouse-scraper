import { ArrowLeft } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { DeleteEmailPollButton } from '@/components/DeleteEmailPollButton';
import { EmailPollShareLink } from '@/components/EmailPollShareLink';
import { EmailPollVisibilityForm } from '@/components/EmailPollVisibilityForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getApiContext } from '@/libs/ApiAuth';
import { getEmailPollResults } from '@/libs/EmailPoll';
import { getPathname, Link } from '@/libs/I18nNavigation';
import { modelLabel } from '@/utils/EmailPoll';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function EmailPollPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'EmailPollPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const results =
    context && z.uuid().safeParse(id).success
      ? await getEmailPollResults({ pollId: id, organizationId: context.organizationId })
      : null;

  if (!results) {
    notFound();
  }

  const score = (value: number | null) =>
    value === null ? '—' : format.number(value, { maximumFractionDigits: 1 });
  // A single sequence costs fractions of a cent
  const usd = (micros: number) =>
    format.number(microsToUsd(micros), { ...USD_FORMAT, maximumFractionDigits: 4 });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard/email-polls/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('back_link')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{results.poll.name}</h1>

          <div className="ml-auto">
            <DeleteEmailPollButton pollId={results.poll.id} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('share_title')}</CardTitle>
            <CardDescription>{t('share_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <EmailPollShareLink path={getPathname({ href: `/vote/${results.poll.id}`, locale })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('visibility_title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailPollVisibilityForm
              pollId={results.poll.id}
              visibility={{ showModel: results.poll.showModel, showCost: results.poll.showCost }}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 p-0">
        <CardHeader className="py-4">
          <CardTitle>{t('models_title')}</CardTitle>
          <CardDescription>{t('models_description', { voters: results.voters })}</CardDescription>
        </CardHeader>

        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('column_model')}</TableHead>
              <TableHead className="text-right">{t('column_average')}</TableHead>
              <TableHead className="text-right">{t('column_std_dev')}</TableHead>
              <TableHead className="text-right">{t('column_votes')}</TableHead>
              <TableHead className="text-right">{t('column_cost')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {results.models.map((row) => (
              <TableRow key={row.model}>
                <TableCell className="font-medium">{modelLabel(row.model)}</TableCell>
                <TableCell className="text-right tabular-nums">{score(row.average)}</TableCell>
                <TableCell className="text-right tabular-nums">{score(row.stdDev)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {usd(row.averageCostMicros)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="gap-0 p-0">
        <CardHeader className="py-4">
          <CardTitle>{t('sequences_title')}</CardTitle>
        </CardHeader>

        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('column_recipient')}</TableHead>
              <TableHead>{t('column_model')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('column_campaign')}</TableHead>
              <TableHead className="text-right">{t('column_average')}</TableHead>
              <TableHead className="text-right">{t('column_votes')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {results.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.groupLabel}</TableCell>
                <TableCell>{modelLabel(item.model)}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {item.campaignName ?? t('campaign_deleted')}
                </TableCell>
                <TableCell className="text-right tabular-nums">{score(item.average)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
