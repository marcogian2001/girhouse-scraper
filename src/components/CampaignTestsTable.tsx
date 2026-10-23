import { useFormatter, useTranslations } from 'next-intl';
import { AnalyzeCampaignButton } from '@/components/AnalyzeCampaignButton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { getCampaignTests } from '@/libs/CampaignTests';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import { TEST_STEPS } from '@/utils/CampaignTests';
import { rateOf } from '@/utils/ReplyStats';

export type CampaignTest = Awaited<ReturnType<typeof getCampaignTests>>[number];

/** What a rate is a share of: the leads contacted, or the step before. */
export type RateBase = 'contacted' | 'step';

/**
 * Formats a rate as a percentage with one decimal, or a dash when there is nothing to divide by.
 * @returns The formatter.
 */
const usePercent = () => {
  const format = useFormatter();

  return (rate: number | null) =>
    rate === null ? '–' : format.number(rate, { style: 'percent', maximumFractionDigits: 1 });
};

/**
 * The structure of a campaign's emails as the AI read it, or the button to read it.
 * @param props Component props.
 * @param props.test The campaign test.
 * @returns The summary and its points.
 */
export const PromptStructure = (props: { test: CampaignTest }) => {
  const t = useTranslations('CampaignTests');
  const analysis = props.test.promptAnalysis;

  if (!analysis) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('structure_missing')}</p>
        <AnalyzeCampaignButton campaignId={props.test.id} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{analysis.summary}</p>
      <ul className="list-disc space-y-0.5 ps-4 text-xs text-muted-foreground">
        {analysis.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Every campaign sent, one row each: who and where it targets, how its emails are
 * built, and how many leads made each step up to the sale.
 * @param props Component props.
 * @param props.tests The campaign tests.
 * @param props.base What the rates are a share of.
 * @returns The table card.
 */
export const CampaignTestsTable = (props: { tests: CampaignTest[]; base: RateBase }) => {
  const t = useTranslations('CampaignTests');
  const format = useFormatter();
  const percent = usePercent();

  return (
    <Card className="p-0">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>{t('column_campaign')}</TableHead>
            <TableHead>{t('column_targeting')}</TableHead>
            <TableHead className="min-w-72">{t('column_structure')}</TableHead>
            <TableHead className="text-right">{t('column_contacted')}</TableHead>
            {TEST_STEPS.map((step) => (
              <TableHead key={step} className="text-right">
                {t(`step_${step}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {props.tests.map((test) => (
            <TableRow key={test.id} className="align-top">
              <TableCell className="max-w-60 whitespace-normal">
                <Link
                  href={`/dashboard/campaigns/${test.id}/`}
                  className="font-medium hover:underline"
                >
                  {test.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {format.dateTime(test.createdAt, {
                    dateStyle: 'medium',
                    timeZone: AppConfig.timeZone,
                  })}
                </p>
                {test.hypothesis && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground italic">
                    {test.hypothesis}
                  </p>
                )}
              </TableCell>

              <TableCell className="whitespace-normal">
                <p>{test.target ?? '–'}</p>
                <p className="text-xs text-muted-foreground">{test.zone ?? '–'}</p>
                <Badge variant="secondary" className="mt-1">
                  {test.botManaged ? t('badge_bot') : t('badge_reps')}
                </Badge>
              </TableCell>

              <TableCell className="whitespace-normal">
                <PromptStructure test={test} />
              </TableCell>

              <TableCell className="text-right tabular-nums">
                <p className="font-medium">{test.contacted}</p>
                {test.isContactedEstimate && (
                  <p className="text-xs text-muted-foreground">{t('contacted_estimate')}</p>
                )}
                {test.bounced !== null && test.bounced > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('bounced', { rate: percent(rateOf(test.bounced, test.contacted)) })}
                  </p>
                )}
              </TableCell>

              {test.steps.map((step) => (
                <TableCell key={step.step} className="text-right tabular-nums">
                  <p className="font-medium">{step.count}</p>
                  <p className="text-xs text-muted-foreground">
                    {percent(props.base === 'contacted' ? step.ofContacted : step.ofBase)}
                  </p>
                  {step.step === 'positive' && test.unclassified > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('unclassified', { count: test.unclassified })}
                    </p>
                  )}
                  {step.step === 'won' && test.wonValue > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {format.number(test.wonValue, { style: 'currency', currency: 'EUR' })}
                    </p>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
