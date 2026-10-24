'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { TableFrame } from '@/components/TableFrame';
import { Badge } from '@/components/ui/badge';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePathname, useRouter } from '@/libs/I18nNavigation';
import type { leadSchema } from '@/models/Schema';
import type { LeadWebsiteView } from '@/utils/LeadWebsiteView';
import { LEAD_WEBSITE_VIEWS } from '@/utils/LeadWebsiteView';

export type LeadRowView = Pick<
  typeof leadSchema.$inferSelect,
  | 'id'
  | 'company'
  | 'city'
  | 'category'
  | 'description'
  | 'phone'
  | 'website'
  | 'domain'
  | 'hasWebsite'
  | 'firstName'
  | 'lastName'
  | 'role'
  | 'email'
  | 'emailSource'
  | 'emailVerification'
  | 'status'
>;

/**
 * Joins the decision maker's name parts.
 * @param lead The lead to name.
 * @returns The full name, or null when no part is known.
 */
const personOf = (lead: LeadRowView) =>
  [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null;

/**
 * Links the phone of a lead so it can be dialled from a phone.
 * @param lead The lead to call.
 * @returns The link, or nothing when no phone is known.
 */
const phoneLink = (lead: LeadRowView) =>
  lead.phone && (
    <a
      href={`tel:${lead.phone.replaceAll(/[^\d+]/gu, '')}`}
      className="block text-xs text-muted-foreground hover:text-primary"
    >
      {lead.phone}
    </a>
  );

/**
 * Shows the start of the business description, with the full text on hover.
 * @param lead The lead to describe.
 * @returns The description, or nothing when none was found.
 */
const descriptionLine = (lead: LeadRowView) =>
  lead.description && (
    <p title={lead.description} className="line-clamp-2 text-xs text-muted-foreground">
      {lead.description}
    </p>
  );

/**
 * One page of the leads of a search, with a filter by website kept in `?website=`.
 * @param props Component props.
 * @param props.leads The leads on this page.
 * @param props.websiteView Which leads the page was rendered with.
 * @param props.matching How many leads match the filter, across every page.
 * @param props.total How many leads the search has.
 * @returns The lead table, or a row list on phones.
 */
export const LeadTable = (props: {
  leads: LeadRowView[];
  websiteView: LeadWebsiteView;
  matching: number;
  total: number;
}) => {
  const t = useTranslations('LeadTable');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const websiteCell = (lead: LeadRowView) =>
    lead.hasWebsite && lead.website ? (
      <a
        href={lead.website}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-primary"
      >
        {lead.domain}
      </a>
    ) : (
      <Badge variant="secondary">{t('badge_no_website')}</Badge>
    );

  const emailNote = (lead: LeadRowView) => {
    if (!lead.emailSource) {
      return null;
    }

    const source = t(`source_${lead.emailSource}`);

    return lead.emailVerification === 'catch_all' ? t('note_catch_all', { source }) : source;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('count', { shown: props.matching, total: props.total })}
        </p>

        <div className="flex items-center gap-2">
          {isPending && <Spinner className="text-muted-foreground" />}

          <Select
            value={props.websiteView}
            onValueChange={(value) => {
              const next = LEAD_WEBSITE_VIEWS.find((option) => option === value);

              if (next) {
                // A new filter starts again from its first page
                startTransition(() => {
                  router.replace(next === 'all' ? pathname : `${pathname}?website=${next}`);
                });
              }
            }}
          >
            <SelectTrigger className="w-48" aria-label={t('filter_label')}>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {LEAD_WEBSITE_VIEWS.map((view) => (
                <SelectItem key={view} value={view}>
                  {t(`filter_${view}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TableFrame className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('column_company')}</TableHead>
              <TableHead>{t('column_website')}</TableHead>
              <TableHead>{t('column_person')}</TableHead>
              <TableHead>{t('column_email')}</TableHead>
              <TableHead>{t('column_status')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {props.leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  {/* Long names and descriptions wrap instead of widening the column */}
                  <div className="w-xs whitespace-normal">
                    <div title={lead.company} className="line-clamp-2 font-medium">
                      {lead.company}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[lead.category, lead.city].filter(Boolean).join(' · ')}
                    </div>
                    {phoneLink(lead)}
                    {descriptionLine(lead)}
                  </div>
                </TableCell>

                <TableCell>{websiteCell(lead)}</TableCell>

                <TableCell>
                  <div className="w-48 whitespace-normal">
                    <div className="line-clamp-2">{personOf(lead) ?? '—'}</div>
                    {lead.role && (
                      <div title={lead.role} className="line-clamp-2 text-xs text-muted-foreground">
                        {lead.role}
                      </div>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div>{lead.email ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{emailNote(lead)}</div>
                </TableCell>

                <TableCell>
                  <StatusBadge kind="lead" status={lead.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>

      {/* Five columns have nowhere to go on a phone, so they become rows */}
      <TableFrame className="md:hidden">
        <ItemGroup>
          {props.leads.map((lead) => (
            <Item key={lead.id}>
              <ItemContent>
                <ItemTitle>{lead.company}</ItemTitle>
                <ItemDescription>
                  {[personOf(lead), lead.email].filter(Boolean).join(' · ') || lead.city}
                </ItemDescription>
                {phoneLink(lead)}
                {descriptionLine(lead)}
                <div>{websiteCell(lead)}</div>
              </ItemContent>

              <ItemActions>
                <StatusBadge kind="lead" status={lead.status} />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </TableFrame>
    </div>
  );
};
