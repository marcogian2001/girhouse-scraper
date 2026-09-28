import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { EmailPollBallot } from '@/components/EmailPollBallot';
import { getEmailPollBallot } from '@/libs/EmailPoll';
import { getClientIp, hashVoter } from '@/utils/Voter';

type EmailPollVotePageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata(props: EmailPollVotePageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'EmailPollVotePage' });

  return {
    title: t('meta_title'),
    robots: { index: false, follow: false },
  };
}

export default async function EmailPollVotePage(props: EmailPollVotePageProps) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'EmailPollVotePage' });
  const voterHash = hashVoter({ pollId: id, ip: getClientIp(await headers()) });
  const ballot = await getEmailPollBallot({ pollId: id, voterHash });

  if (!ballot) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{ballot.name}</h1>
        <p className="text-sm text-muted-foreground">{t('instructions')}</p>
      </div>

      <EmailPollBallot pollId={id} groups={ballot.groups} />
    </div>
  );
}
