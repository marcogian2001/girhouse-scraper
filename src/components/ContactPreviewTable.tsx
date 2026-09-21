'use client';

import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ContactRow } from '@/utils/Csv';

const PREVIEW_ROWS = 5;

export const ContactPreviewTable = (props: { contacts: ContactRow[]; totalRows: number }) => {
  const t = useTranslations('NewCampaignWizard');

  const hidden = props.contacts.length - PREVIEW_ROWS;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t('preview_caption', {
          valid: props.contacts.length,
          skipped: props.totalRows - props.contacts.length,
        })}
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('column_email')}</TableHead>
              <TableHead>{t('column_name')}</TableHead>
              <TableHead>{t('column_company')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {props.contacts.slice(0, PREVIEW_ROWS).map((contact) => (
              <TableRow key={contact.email}>
                <TableCell>{contact.email}</TableCell>
                <TableCell>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                </TableCell>
                <TableCell>{contact.company}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">{t('preview_more', { count: hidden })}</p>
      )}
    </div>
  );
};
