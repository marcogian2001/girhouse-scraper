'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { leadSchema } from '@/models/Schema';

export type LeadRowView = Pick<
  typeof leadSchema.$inferSelect,
  | 'id'
  | 'company'
  | 'city'
  | 'category'
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

type WebsiteView = 'all' | 'without' | 'with';

const WEBSITE_VIEWS: WebsiteView[] = ['all', 'without', 'with'];

/**
 * Joins the decision maker's name parts.
 * @param lead The lead to name.
 * @returns The full name, or null when no part is known.
 */
const personOf = (lead: LeadRowView) =>
  [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null;

export const LeadTable = (props: { leads: LeadRowView[] }) => {
  const t = useTranslations('LeadTable');
  const [websiteView, setWebsiteView] = useState<WebsiteView>('all');

  const leads = props.leads.filter(
    (lead) =>
      websiteView === 'all' || (websiteView === 'with' ? lead.hasWebsite : !lead.hasWebsite),
  );

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
          {t('count', { shown: leads.length, total: props.leads.length })}
        </p>

        <Select
          value={websiteView}
          onValueChange={(value) => {
            const next = WEBSITE_VIEWS.find((option) => option === value);

            if (next) {
              setWebsiteView(next);
            }
          }}
        >
          <SelectTrigger className="w-48" aria-label={t('filter_label')}>
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {WEBSITE_VIEWS.map((view) => (
              <SelectItem key={view} value={view}>
                {t(`filter_${view}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="hidden p-0 md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('column_company')}</TableHead>
              <TableHead>{t('column_website')}</TableHead>
              <TableHead>{t('column_person')}</TableHead>
              <TableHead>{t('column_email')}</TableHead>
              <TableHead>{t('column_status')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="font-medium">{lead.company}</div>
                  <div className="text-xs text-muted-foreground">
                    {[lead.category, lead.city].filter(Boolean).join(' · ')}
                  </div>
                </TableCell>

                <TableCell>{websiteCell(lead)}</TableCell>

                <TableCell>
                  <div>{personOf(lead) ?? '—'}</div>
                  {lead.role && <div className="text-xs text-muted-foreground">{lead.role}</div>}
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
      </Card>

      {/* Five columns have nowhere to go on a phone, so they become rows */}
      <Card className="p-0 md:hidden">
        <ItemGroup>
          {leads.map((lead) => (
            <Item key={lead.id}>
              <ItemContent>
                <ItemTitle>{lead.company}</ItemTitle>
                <ItemDescription>
                  {[personOf(lead), lead.email].filter(Boolean).join(' · ') || lead.city}
                </ItemDescription>
                <div>{websiteCell(lead)}</div>
              </ItemContent>

              <ItemActions>
                <StatusBadge kind="lead" status={lead.status} />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </Card>
    </div>
  );
};
