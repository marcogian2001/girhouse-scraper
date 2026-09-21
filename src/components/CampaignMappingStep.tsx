'use client';

import { useTranslations } from 'next-intl';
import { ColumnMapper } from '@/components/ColumnMapper';
import { ContactPreviewTable } from '@/components/ContactPreviewTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ColumnMapping, ContactRow } from '@/utils/Csv';
import { MAX_CONTACTS_PER_CAMPAIGN } from '@/validations/CampaignValidation';

export const CampaignMappingStep = (props: {
  headers: string[];
  mapping: ColumnMapping;
  contacts: ContactRow[];
  totalRows: number;
  onChange: (mapping: ColumnMapping) => void;
}) => {
  const t = useTranslations('NewCampaignWizard');

  const isEmpty = props.contacts.length === 0;
  const isTooMany = props.contacts.length > MAX_CONTACTS_PER_CAMPAIGN;

  return (
    <div className="space-y-6">
      <ColumnMapper headers={props.headers} mapping={props.mapping} onChange={props.onChange} />

      {isEmpty && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_no_contacts')}</AlertDescription>
        </Alert>
      )}

      {isTooMany && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('error_too_many_contacts', {
              count: props.contacts.length,
              max: MAX_CONTACTS_PER_CAMPAIGN,
            })}
          </AlertDescription>
        </Alert>
      )}

      {!isEmpty && <ContactPreviewTable contacts={props.contacts} totalRows={props.totalRows} />}
    </div>
  );
};
