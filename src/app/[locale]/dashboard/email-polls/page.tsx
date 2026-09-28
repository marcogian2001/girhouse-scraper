import { Plus, Vote } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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

export default async function EmailPollsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'EmailPollsPage' });
  const context = await getApiContext();
  const polls = context ? await listEmailPolls(context.organizationId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Button asChild className="h-10 px-4">
          <Link href="/dashboard/email-polls/new/">
            <Plus />
            {t('button_new')}
          </Link>
        </Button>
      </div>

      {polls.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Vote className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t('column_name')}</TableHead>
                <TableHead className="text-right">{t('column_sequences')}</TableHead>
                <TableHead className="text-right">{t('column_voters')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('column_created')}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {polls.map((poll) => (
                <TableRow key={poll.id} className="hover:bg-accent/40">
                  <TableCell>
                    <Link
                      href={`/dashboard/email-polls/${poll.id}/`}
                      className="font-medium hover:text-primary"
                    >
                      {poll.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{poll.sequences}</TableCell>
                  <TableCell className="text-right tabular-nums">{poll.voters}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {poll.createdAt.toLocaleDateString(locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
