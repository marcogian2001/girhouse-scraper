import { ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { DemoVersionPanel } from '@/components/DemoVersionPanel';
import { GenerateDemoButton } from '@/components/GenerateDemoButton';
import { RebuildDemoForm } from '@/components/RebuildDemoForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { getConversationDemo } from '@/libs/Demos';
import { DEMO_STEPS } from '@/utils/DemoStats';

type ConversationDemo = NonNullable<Awaited<ReturnType<typeof getConversationDemo>>>;

/**
 * Picks the strongest contact signal a lead gave on the demo.
 * @param summary The demo summary.
 * @returns The message key, or null when the lead left no contact.
 */
const contactKey = (summary: ConversationDemo['summary']) => {
  if (summary.phoneLeft) {
    return 'phone_left' as const;
  }

  return summary.whatsappClicked ? ('whatsapp_clicked' as const) : null;
};

/**
 * The demo of a conversation, with how far the lead went through it.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @param props.demo The demo and its summary, or null when none was built yet.
 * @returns The card.
 */
export const ConversationDemoCard = (props: {
  conversationId: string;
  demo: ConversationDemo | null;
}) => {
  const t = useTranslations('ConversationDemoCard');
  const format = useFormatter();

  if (!props.demo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('empty')}</CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateDemoButton conversationId={props.conversationId} />
        </CardContent>
      </Card>
    );
  }

  const { demo, summary, url } = props.demo;
  const contact = contactKey(summary);

  const facts = [
    [
      t('fact_created'),
      format.dateTime(demo.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
    ],
    [
      t('fact_opened'),
      demo.firstOpenedAt
        ? format.dateTime(demo.firstOpenedAt, { dateStyle: 'medium', timeStyle: 'short' })
        : t('not_opened'),
    ],
    [t('fact_step'), t('step_value', { step: summary.maxStep, total: DEMO_STEPS })],
    [t('fact_time'), t('time_value', { minutes: Math.round(summary.secondsOnPage / 60) })],
    [
      t('fact_booked'),
      demo.bookedAt
        ? format.dateTime(demo.bookedAt, { dateStyle: 'medium', timeStyle: 'short' })
        : t('not_booked'),
    ],
    [t('fact_contact'), contact ? t(contact) : '-'],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t(`behavior_${summary.behavior}`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a
          href={`${url}?anteprima=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('open_preview')}
          <ExternalLink className="size-3.5" />
        </a>
        <p className="text-xs break-all text-muted-foreground">{url}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <DemoVersionPanel
          conversationId={props.conversationId}
          url={url}
          version={demo.version}
          vslStatus={props.demo.vslStatus}
          pains={demo.vsl?.pains ?? []}
        />
        <RebuildDemoForm conversationId={props.conversationId} guidance={demo.guidance} />
      </CardContent>
    </Card>
  );
};
