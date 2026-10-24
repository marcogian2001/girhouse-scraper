'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ExampleEmailButton } from '@/components/ExampleEmailButton';
import { TableFrame } from '@/components/TableFrame';
import { TestedNoteEditor } from '@/components/TestedNoteEditor';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { getCampaignTests } from '@/libs/CampaignTests';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import type { TestStep } from '@/utils/CampaignTests';
import { TEST_STEPS } from '@/utils/CampaignTests';
import { rateOf } from '@/utils/ReplyStats';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export type CampaignTest = Awaited<ReturnType<typeof getCampaignTests>>[number];

/** What a rate is a share of: the leads contacted, or the step before. */
type RateBase = 'contacted' | 'step';

const RATE_BASES: RateBase[] = ['contacted', 'step'];

/** The columns the table sorts on. */
type SortKey =
  | 'created'
  | 'contacted'
  | TestStep
  | 'cost'
  | 'cost_per_positive'
  | 'cost_per_call'
  | 'cost_per_won';

/** Costs read better low first; everything else high first. */
const ASCENDING_FIRST = new Set<SortKey>([
  'cost',
  'cost_per_positive',
  'cost_per_call',
  'cost_per_won',
]);

/**
 * Reads the value a column sorts on: a step sorts on the rate shown, so campaigns of
 * different sizes compare fairly.
 * @param test The campaign test.
 * @param key The column.
 * @param base What the rates are a share of.
 * @returns The value, null when there is none.
 */
const sortValue = (test: CampaignTest, key: SortKey, base: RateBase) => {
  if (key === 'created') {
    return test.createdAt.getTime();
  }

  if (key === 'contacted') {
    return test.contacted;
  }

  if (key === 'cost') {
    return test.costMicros;
  }

  if (key === 'cost_per_positive') {
    return test.costPerPositiveMicros;
  }

  if (key === 'cost_per_call') {
    return test.costPerCallMicros;
  }

  if (key === 'cost_per_won') {
    return test.costPerWonMicros;
  }

  const step = test.steps.find((item) => item.step === key);

  return (base === 'contacted' ? step?.ofContacted : step?.ofBase) ?? null;
};

/**
 * A header that sorts the table on its column and explains it on hover.
 * @param props Component props.
 * @param props.label The column name.
 * @param props.hint What the column counts.
 * @param props.direction The sort direction when the table is sorted on it.
 * @param props.onSort Sorts on the column.
 * @param props.className Extra classes for the cell.
 * @returns The header cell.
 */
const SortableHead = (props: {
  label: string;
  hint: string;
  direction: 'asc' | 'desc' | null;
  onSort: () => void;
  className?: string;
}) => (
  <TableHead className={props.className}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={props.onSort}
          className="inline-flex items-center gap-1 underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 hover:text-foreground"
        >
          {props.label}
          {props.direction === 'asc' && <ArrowUp className="size-3" />}
          {props.direction === 'desc' && <ArrowDown className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{props.hint}</TooltipContent>
    </Tooltip>
  </TableHead>
);

/**
 * A header that only explains its column on hover.
 * @param props Component props.
 * @param props.label The column name.
 * @param props.hint What the column shows.
 * @returns The header cell.
 */
const HintHead = (props: { label: string; hint: string }) => (
  <TableHead>
    <Tooltip>
      <TooltipTrigger className="underline decoration-muted-foreground/40 decoration-dotted underline-offset-4">
        {props.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{props.hint}</TooltipContent>
    </Tooltip>
  </TableHead>
);

/**
 * Every campaign sent, one row each: what it tested, who and where it targets, an
 * example email, how many leads made each step up to the sale and what each result
 * cost. The rate base and the sort change instantly, in the browser.
 * @param props Component props.
 * @param props.tests The campaign tests.
 * @returns The rate picker and the table.
 */
export const CampaignTestsTable = (props: { tests: CampaignTest[] }) => {
  const t = useTranslations('CampaignTests');
  const format = useFormatter();
  const [base, setBase] = useState<RateBase>('contacted');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'created',
    direction: 'desc',
  });

  const percent = (rate: number | null) =>
    rate === null ? '–' : format.number(rate, { style: 'percent', maximumFractionDigits: 1 });
  const usd = (micros: number | null) =>
    micros === null ? '–' : format.number(microsToUsd(micros), USD_FORMAT);

  const sorted = props.tests.toSorted((a, b) => {
    const left = sortValue(a, sort.key, base);
    const right = sortValue(b, sort.key, base);

    // Campaigns without a value stay at the bottom either way
    if (left === null || right === null) {
      return Number(left === null) - Number(right === null);
    }

    return sort.direction === 'asc' ? left - right : right - left;
  });

  const sortOn = (key: SortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }

      return { key, direction: ASCENDING_FIRST.has(key) ? 'asc' : 'desc' };
    });
  };

  const head = (key: SortKey, label: string, hint: string) => (
    <SortableHead
      key={key}
      label={label}
      hint={hint}
      className="text-right [&>button]:ms-auto"
      direction={sort.key === key ? sort.direction : null}
      onSort={() => {
        sortOn(key);
      }}
    />
  );

  const stepCell = (test: CampaignTest, step: CampaignTest['steps'][number]) => (
    <TableCell key={step.step} className="text-right tabular-nums">
      <p className="font-medium">{step.count}</p>
      <p className="text-xs text-muted-foreground">
        {percent(base === 'contacted' ? step.ofContacted : step.ofBase)}
      </p>
      {step.step === 'won' && test.wonValue > 0 && (
        <p className="text-xs text-muted-foreground">
          {format.number(test.wonValue, { style: 'currency', currency: 'EUR' })}
        </p>
      )}
    </TableCell>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{t('label_base')}</span>
        <Select
          value={base}
          onValueChange={(value) => {
            const next = RATE_BASES.find((option) => option === value);

            if (next) {
              setBase(next);
            }
          }}
        >
          <SelectTrigger aria-label={t('label_base')} className="w-56">
            <SelectValue>{t(`base_${base}`)}</SelectValue>
          </SelectTrigger>

          <SelectContent className="max-w-80">
            {RATE_BASES.map((option) => (
              <SelectItem key={option} value={option} className="items-start py-2">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{t(`base_${option}`)}</span>
                  <span className="text-xs whitespace-normal text-muted-foreground">
                    {t(`base_${option}_hint`)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The table scrolls inside its own box, so the header and the first column stay put */}
      <TableFrame className="**:data-[slot=table-container]:max-h-[calc(100svh-14rem)] **:data-[slot=table-container]:overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_var(--border)]">
            <TableRow className="hover:bg-transparent">
              <SortableHead
                label={t('column_campaign')}
                hint={t('hint_campaign')}
                className="sticky left-0 z-30 bg-muted"
                direction={sort.key === 'created' ? sort.direction : null}
                onSort={() => {
                  sortOn('created');
                }}
              />
              <TableHead>{t('column_tested')}</TableHead>
              <TableHead>{t('column_targeting')}</TableHead>
              <TableHead>{t('column_email')}</TableHead>
              {head('contacted', t('column_contacted'), t('hint_contacted'))}
              {TEST_STEPS.slice(0, 2).map((step) =>
                head(step, t(`step_${step}`), t(`hint_${step}`)),
              )}
              <HintHead label={t('column_replies_by_email')} hint={t('hint_replies_by_email')} />
              {TEST_STEPS.slice(2).map((step) => head(step, t(`step_${step}`), t(`hint_${step}`)))}
              {head('cost', t('column_cost'), t('hint_cost'))}
              {head(
                'cost_per_positive',
                t('column_cost_per_positive'),
                t('hint_cost_per_positive'),
              )}
              {head('cost_per_call', t('column_cost_per_call'), t('hint_cost_per_call'))}
              {head('cost_per_won', t('column_cost_per_won'), t('hint_cost_per_won'))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {sorted.map((test) => (
              <TableRow key={test.id} className="align-top">
                <TableCell className="sticky left-0 z-10 max-w-56 min-w-48 border-r bg-card whitespace-normal">
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
                  <Badge variant="secondary" className="mt-1">
                    {test.botManaged ? t('badge_bot') : t('badge_reps')}
                  </Badge>
                </TableCell>

                <TableCell className="max-w-64 min-w-44 whitespace-normal">
                  <TestedNoteEditor campaignId={test.id} note={test.hypothesis} />
                </TableCell>

                <TableCell className="whitespace-normal">
                  <p>{test.target ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">{test.zone ?? '–'}</p>
                </TableCell>

                <TableCell>
                  <ExampleEmailButton campaignName={test.name} email={test.exampleEmail} />
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

                {test.steps.slice(0, 2).map((step) => stepCell(test, step))}

                <TableCell className="min-w-32">
                  {test.repliesByEmail.length === 0 ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs tabular-nums">
                      {test.repliesByEmail.map((item) => (
                        <li key={item.email} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t('email_number', { number: item.email })}
                          </span>
                          <span>
                            {item.count} · {percent(item.share)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>

                {test.steps.slice(2).map((step) => stepCell(test, step))}

                <TableCell className="text-right font-medium tabular-nums">
                  {usd(test.costMicros)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {usd(test.costPerPositiveMicros)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {usd(test.costPerCallMicros)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {usd(test.costPerWonMicros)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </div>
  );
};
