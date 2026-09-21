'use client';

import { useTranslations } from 'next-intl';
import type { DraftView } from '@/components/EmailDraftEditor';
import { EmailDraftTabs } from '@/components/EmailDraftTabs';
import type { EnrichmentView } from '@/components/EnrichmentCard';
import { EnrichmentCard } from '@/components/EnrichmentCard';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { contactSchema } from '@/models/Schema';

type ContactStatus = (typeof contactSchema.$inferSelect)['status'];

export type ContactReview = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: ContactStatus;
  errorMessage: string | null;
  enrichment: EnrichmentView | null;
  drafts: DraftView[];
};

/**
 * Builds the monogram for a contact, falling back to their email.
 * @param contact The contact to label.
 * @returns Up to two uppercase initials.
 */
const getInitials = (contact: ContactReview) => {
  const parts = [contact.firstName, contact.lastName].filter(Boolean);

  if (parts.length === 0) {
    return contact.email.slice(0, 2).toUpperCase();
  }

  return parts
    .map((part) => part?.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
};

export const ContactReviewList = (props: {
  contacts: ContactReview[];
  delaysDays: number[];
  emailCount: number;
}) => {
  const t = useTranslations('ContactReviewList');

  if (props.contacts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <Accordion type="multiple" className="w-full">
      {props.contacts.map((contact) => (
        <AccordionItem key={contact.id} value={contact.id}>
          <AccordionTrigger>
            <div className="flex flex-1 items-center gap-3 pr-2 text-left">
              <Avatar className="size-9 rounded-lg">
                <AvatarFallback className="rounded-lg bg-muted text-xs font-medium">
                  {getInitials(contact)}
                </AvatarFallback>
              </Avatar>

              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">
                  {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email}
                </span>
                <span className="truncate text-sm text-muted-foreground">{contact.email}</span>
              </div>

              <span className="text-sm text-muted-foreground tabular-nums">
                {t('draft_count', { written: contact.drafts.length, total: props.emailCount })}
              </span>

              <StatusBadge kind="contact" status={contact.status} />
            </div>
          </AccordionTrigger>

          <AccordionContent className="space-y-4">
            {contact.errorMessage && (
              <p className="text-sm text-destructive">{contact.errorMessage}</p>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('section_research')}</h3>
              <EnrichmentCard enrichment={contact.enrichment} />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t('section_emails')}</h3>

              {contact.drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('no_drafts')}</p>
              ) : (
                <EmailDraftTabs drafts={contact.drafts} delaysDays={props.delaysDays} />
              )}
            </section>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};
