import { Plus, Vote } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { TableFrame } from '@/components/TableFrame';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getApiContext } from '@/libs/ApiAuth';
import { listEmailPolls } from '@/libs/EmailPoll';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';

export default async function EmailPollsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'EmailPollsPage' });
  const context = await getApiContext();
  const polls = context ? await listEmailPolls(context.organizationId) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild>
            <Link href="/dashboard/email-polls/new/">
              <Plus />
              {t('button_new')}
            </Link>
          </Button>
        }
      />

      {polls.length === 0 ? (
        <EmptyState icon={<Vote />} title={t('empty_title')} description={t('empty_description')} />
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('column_name')}</TableHead>
                <TableHead className="text-right">{t('column_sequences')}</TableHead>
                <TableHead className="text-right">{t('column_voters')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('column_created')}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {polls.map((poll) => (
                <TableRow key={poll.id} className="relative">
                  <TableCell>
                    <Link
                      href={`/dashboard/email-polls/${poll.id}/`}
                      className="font-medium after:absolute after:inset-0"
                    >
                      {poll.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{poll.sequences}</TableCell>
                  <TableCell className="text-right tabular-nums">{poll.voters}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {poll.createdAt.toLocaleDateString(locale, { timeZone: AppConfig.timeZone })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
